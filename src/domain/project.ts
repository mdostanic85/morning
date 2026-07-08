export interface Project {
  id: number;
  name: string;
  description: string | null;
  // Used to match incoming signals (transcripts, tickets, PRs, ...) to this project.
  keywords: string[];
  people: string[];
  jiraKeys: string[];
  repoPaths: string[];
  figmaFileKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithCounts extends Project {
  openTaskCount: number;
}

export type NewProject = Pick<Project, "name"> &
  Partial<
    Pick<
      Project,
      "description" | "keywords" | "people" | "jiraKeys" | "repoPaths" | "figmaFileKeys"
    >
  >;

export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>;
