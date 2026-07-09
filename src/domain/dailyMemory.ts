export interface DailyMemory {
  id: number;
  date: string;
  whatWorkedOn: string[];
  completed: string[];
  stillOpen: string[];
  waitingOn: string[];
  firstTomorrow: string | null;
  risks: string[];
  summary: string;
  confidence: number | null;
  createdAt: string;
}

export type NewDailyMemory = Pick<
  DailyMemory,
  "date" | "whatWorkedOn" | "completed" | "stillOpen" | "waitingOn" | "summary"
> &
  Partial<Pick<DailyMemory, "firstTomorrow" | "risks" | "confidence">>;
