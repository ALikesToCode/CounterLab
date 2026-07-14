import { useEffect, useState } from "react";

import type { ArtifactView, SessionView } from "../api";
import type { RecentProject, StudioMode } from "../components/studio/types";

const recentProjectsKey = "counterlab.recentProjects.v1";

function readRecentProjects(): RecentProject[] {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(recentProjectsKey) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (project): project is RecentProject =>
          typeof project === "object" &&
          project !== null &&
          typeof project.sessionId === "string" &&
          typeof project.artifactId === "string" &&
          typeof project.fileName === "string" &&
          (project.mode === "instant" ||
            project.mode === "live" ||
            project.mode === "replay") &&
          typeof project.state === "string" &&
          typeof project.updatedAt === "string",
      )
      .slice(0, 6);
  } catch {
    return [];
  }
}

export function useRecentProjects(
  session: SessionView | null,
  artifact: ArtifactView | null,
  mode: StudioMode,
) {
  const [projects, setProjects] = useState<RecentProject[]>(readRecentProjects);

  useEffect(() => {
    if (session === null || artifact === null) return;
    setProjects((current) => {
      const next: RecentProject[] = [
        {
          sessionId: session.sessionId,
          artifactId: artifact.artifactId,
          fileName: artifact.fileName,
          mode,
          state: session.state,
          updatedAt: session.updatedAt,
        },
        ...current.filter((project) => project.sessionId !== session.sessionId),
      ].slice(0, 6);
      window.localStorage.setItem(recentProjectsKey, JSON.stringify(next));
      return next;
    });
  }, [artifact, mode, session]);

  return projects;
}
