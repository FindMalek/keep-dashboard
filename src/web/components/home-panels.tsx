import type { DnsStats, InternetStats, MusicStats, ReadingStats } from "../../shared/types";

function OpenLink({ href, label }: { href: string | null; label: string }) {
  return href ? (
    <a className="domain" href={href} target="_blank" rel="noreferrer">
      {label} ↗
    </a>
  ) : (
    <span>{label}</span>
  );
}
import { mbps, percent } from "../lib/format";
import { since } from "../lib/time";
import { Chip } from "./chip";
import { Panel } from "./panel";
import { Sparkline } from "./sparkline";

const count = (value: number): string => value.toLocaleString();

function Unreachable({ what }: { what: string }) {
  return <p className="empty">{what} not reachable</p>;
}

export function MusicPanel({ music, link }: { music: MusicStats; link: string | null }) {
  return (
    <Panel title="music" area="mus" meta={<OpenLink href={link} label="navidrome" />}>
      {!music.reachable ? (
        <Unreachable what="navidrome" />
      ) : (
        <>
          <div className="headline">
            <span className="big">{count(music.albums)}</span>
            <dl className="facts">
              <div><dt>albums</dt><dd>{count(music.albums)}</dd></div>
              <div><dt>songs</dt><dd>{count(music.songs)}</dd></div>
              <div><dt>artists</dt><dd>{count(music.artists)}</dd></div>
            </dl>
          </div>
          <h3 className="subhead">playing now</h3>
          {music.nowPlaying.length === 0 ? (
            <p className="empty">nothing playing</p>
          ) : (
            <ul className="list compact">
              {music.nowPlaying.map((entry) => (
                <li key={`${entry.user}-${entry.title}`}>
                  <span className="ellipsis">
                    <Chip tone="solid">live</Chip> {entry.title} <span className="muted">· {entry.artist}</span>
                  </span>
                  <span className="muted small">{entry.user} · {entry.player}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="subhead">recently added</h3>
          <ul className="list compact">
            {music.recentlyAdded.map((album) => (
              <li key={`${album.artist}-${album.album}`}>
                <span className="ellipsis">
                  {album.album} <span className="muted">· {album.artist}</span>
                </span>
                <span className="num muted">{album.year ?? ""}</span>
              </li>
            ))}
          </ul>
          {music.lastImport && (
            <p className="faint small">
              last import {since(Date.parse(music.lastImport.at))}: {music.lastImport.imported} tracks
              {music.lastImport.leftInInbox > 0 && <span className="level-warn"> · {music.lastImport.leftInInbox} left in inbox</span>}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

export function DnsPanel({ dns }: { dns: DnsStats }) {
  const ratio = dns.queries ? dns.blocked / dns.queries : 0;
  return (
    <Panel title="ad blocking" area="dnsb" meta={dns.reachable ? (dns.protection ? "adguard · on" : <span className="level-crit">protection off</span>) : "adguard"}>
      {!dns.reachable ? (
        <Unreachable what="adguard" />
      ) : (
        <>
          <div className="headline">
            <span className="big">{percent(ratio)}</span>
            <dl className="facts">
              <div><dt>queries 24h</dt><dd>{count(dns.queries)}</dd></div>
              <div><dt>blocked</dt><dd>{count(dns.blocked)}</dd></div>
              <div><dt>avg</dt><dd>{dns.avgMs.toFixed(1)} ms</dd></div>
            </dl>
          </div>
          <Sparkline
            values={dns.hourlyQueries}
            secondary={dns.hourlyBlocked}
            capacity={Math.max(24, dns.hourlyQueries.length)}
            stepSec={3600}
            minTop={10}
            format={(value) => `${Math.round(value)} q`}
            height={40}
            label="dns queries and blocked, per hour"
          />
          <h3 className="subhead">most blocked</h3>
          {dns.topBlocked.length === 0 ? (
            <p className="empty">nothing yet</p>
          ) : (
            <ul className="list compact">
              {dns.topBlocked.map((entry) => (
                <li key={entry.domain}>
                  <span className="ellipsis mono">{entry.domain}</span>
                  <span className="num muted">{count(entry.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

export function InternetPanel({ internet }: { internet: InternetStats }) {
  const latest = internet.latest;
  return (
    <Panel title="internet" area="inet" meta={latest?.isp?.toLowerCase() ?? "speedtest"}>
      {!latest ? (
        <p className="empty">no speed test yet · runs every 4 h</p>
      ) : (
        <>
          <div className="headline">
            <span className="big">↓ {mbps(latest.downBps)}</span>
            <dl className="facts">
              <div><dt>upload</dt><dd>↑ {mbps(latest.upBps)}</dd></div>
              <div><dt>ping</dt><dd>{Math.round(latest.pingMs)} ms</dd></div>
              <div><dt>tested</dt><dd>{since(Date.parse(latest.at))}</dd></div>
            </dl>
          </div>
          <Sparkline
            values={internet.history.map((result) => result.downBps)}
            secondary={internet.history.map((result) => result.upBps)}
            capacity={Math.max(42, internet.history.length)}
            stepSec={4 * 3600}
            format={mbps}
            height={40}
            label="download and upload, last 7 days"
          />
          <p className="faint small">{latest.server ? `${latest.server.toLowerCase()} · ` : ""}every 4 h · last 7 days</p>
        </>
      )}
    </Panel>
  );
}

export function ReadingPanel({ reading, link }: { reading: ReadingStats; link: string | null }) {
  return (
    <Panel title="reading" area="read" meta={<OpenLink href={link} label="miniflux" />}>
      {!reading.reachable ? (
        <Unreachable what="miniflux" />
      ) : (
        <>
          <div className="headline">
            <span className="big">{count(reading.unread)}</span>
            <dl className="facts">
              <div><dt>unread</dt><dd>{count(reading.unread)}</dd></div>
              <div><dt>feeds</dt><dd>{count(reading.feeds)}</dd></div>
            </dl>
          </div>
          {reading.latest.length === 0 ? (
            <p className="empty">{reading.feeds === 0 ? "no feeds yet · add some in miniflux" : "all caught up"}</p>
          ) : (
            <ul className="list compact">
              {reading.latest.map((entry) => (
                <li key={entry.url}>
                  <a className="row-link ellipsis" href={entry.url} target="_blank" rel="noreferrer">
                    {entry.title}
                  </a>
                  <span className="muted small">{entry.feed.toLowerCase()} · {since(Date.parse(entry.publishedAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
