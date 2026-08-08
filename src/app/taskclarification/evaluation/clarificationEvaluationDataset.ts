export type ClarificationEvaluationCategory = "vague" | "clear" | "multi_part" | "research" | "sensitive" | "ambiguous";

export type ClarificationEvaluationCase = {
  id: string;
  category: ClarificationEvaluationCategory;
  task: {
    title: string;
    taskType: "recurring" | "once-off";
    dueDate?: string;
  };
  rubric: {
    titleTerms: string[];
    firstActionRequired: boolean;
    subtaskCount: { min: number; max: number };
    maxDurationMinutes: number;
    allowNullDuration: boolean;
    requiredNullFields: Array<"suggestedTitle" | "definitionOfDone" | "firstAction" | "stoppingPoint" | "estimatedMinutes" | "estimatedRange">;
    forbiddenTerms: string[];
  };
};

export const CLARIFICATION_EVALUATION_DATASET = {
  version: "clarification-eval-v1",
  cases: [
    {
      id: "vague-launch-001",
      category: "vague",
      task: { title: "Sort out the fictional launch", taskType: "recurring" },
      rubric: {
        titleTerms: ["launch"],
        firstActionRequired: true,
        subtaskCount: { min: 1, max: 4 },
        maxDurationMinutes: 240,
        allowNullDuration: false,
        requiredNullFields: [],
        forbiddenTerms: ["Alex", "Dropbox", "Monday"],
      },
    },
    {
      id: "clear-checklist-001",
      category: "clear",
      task: { title: "Email the fictional QA checklist to the release team", taskType: "once-off", dueDate: "2099-05-12" },
      rubric: {
        titleTerms: ["qa", "checklist"],
        firstActionRequired: true,
        subtaskCount: { min: 0, max: 2 },
        maxDurationMinutes: 60,
        allowNullDuration: false,
        requiredNullFields: [],
        forbiddenTerms: ["real customer", "external address", "Monday"],
      },
    },
    {
      id: "multi-part-release-001",
      category: "multi_part",
      task: { title: "Draft and send the fictional release note, then archive the test branch", taskType: "recurring" },
      rubric: {
        titleTerms: ["release"],
        firstActionRequired: true,
        subtaskCount: { min: 2, max: 4 },
        maxDurationMinutes: 180,
        allowNullDuration: false,
        requiredNullFields: [],
        forbiddenTerms: ["main branch", "Jordan", "Friday"],
      },
    },
    {
      id: "research-storage-001",
      category: "research",
      task: { title: "Research battery storage options for a fictional apartment", taskType: "recurring" },
      rubric: {
        titleTerms: ["research"],
        firstActionRequired: true,
        subtaskCount: { min: 1, max: 4 },
        maxDurationMinutes: 240,
        allowNullDuration: false,
        requiredNullFields: [],
        forbiddenTerms: ["vendor quote", "government grant", "specific regulation"],
      },
    },
    {
      id: "sensitive-note-001",
      category: "sensitive",
      task: { title: "Prepare a private note about a fictional medical appointment", taskType: "once-off" },
      rubric: {
        titleTerms: ["private", "note"],
        firstActionRequired: true,
        subtaskCount: { min: 0, max: 2 },
        maxDurationMinutes: 60,
        allowNullDuration: true,
        requiredNullFields: ["estimatedMinutes", "estimatedRange"],
        forbiddenTerms: ["diagnosis", "medication", "doctor name", "patient number"],
      },
    },
    {
      id: "ambiguous-follow-up-001",
      category: "ambiguous",
      task: { title: "Follow up about it sometime", taskType: "recurring" },
      rubric: {
        titleTerms: [],
        firstActionRequired: false,
        subtaskCount: { min: 0, max: 2 },
        maxDurationMinutes: 60,
        allowNullDuration: true,
        requiredNullFields: ["estimatedMinutes", "estimatedRange"],
        forbiddenTerms: ["Alex", "Monday", "email address", "deadline"],
      },
    },
  ] satisfies ClarificationEvaluationCase[],
} as const;
