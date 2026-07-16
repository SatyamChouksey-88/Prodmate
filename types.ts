export interface User {
  name: string;
  role: 'Product Owner' | 'Business Analyst' | 'Scrum Master';
}

export interface HistoryItem {
  id: string; // ISO string timestamp
  title: string;
  date: string;
  data: Epic[];
}

/** Fibonacci effort values used for generation + export. */
export type StoryPoints = 1 | 2 | 3 | 5 | 8 | 13;

export const STORY_POINTS_OPTIONS: StoryPoints[] = [1, 2, 3, 5, 8, 13];

export interface UserStory {
  id: string;
  story: string;
  acceptance_criteria: string[];
  business_value: 'High' | 'Medium' | 'Low';
  risk_impact: 'High' | 'Medium' | 'Low';
  dependencies: string[];
  /** Optional for older saved generations; new generates always set it. */
  story_points?: StoryPoints;
}

export interface Feature {
  feature: string;
  feature_description: string;
  user_stories: UserStory[];
}

export interface Epic {
  epic: string;
  epic_description: string;
  features: Feature[];
}
