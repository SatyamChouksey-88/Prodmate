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

export interface UserStory {
  id: string;
  story: string;
  acceptance_criteria: string[];
  business_value: 'High' | 'Medium' | 'Low';
  risk_impact: 'High' | 'Medium' | 'Low';
  dependencies: string[];
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
