import type { AppService, AppsStats } from "../../shared/types";
import type { Status } from "../components/status-square";

export function appStatus(service: AppService): Status {
  if (service.status === "error" || service.lastDeploy?.status === "error") return "down";
  if (service.total > 0 && service.running === 0) return "down";
  if (service.status === "idle" || service.status === "running" || service.running < service.total) return "warn";
  return "ok";
}

export function allServices(apps: AppsStats): AppService[] {
  return apps.projects.flatMap((project) => project.environments.flatMap((environment) => environment.services));
}
