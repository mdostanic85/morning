export type ProjectStatus = "active" | "inactive";

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  // Used to match incoming signals (transcripts, tickets, PRs, ...) to this project.
  keywords: string[];
  people: string[];
  jiraKeys: string[];
  repoPaths: string[];
  githubRepositories: string[];
  confluenceSpaces: string[];
  confluencePageUrls: string[];
  discordChannels: string[];
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
      | "description"
      | "keywords"
      | "people"
      | "jiraKeys"
      | "repoPaths"
      | "githubRepositories"
      | "confluenceSpaces"
      | "confluencePageUrls"
      | "discordChannels"
      | "figmaFileKeys"
    >
  >;

export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>;
