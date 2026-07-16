import { GoogleGenAI, Type } from "@google/genai";
import type { Epic } from '../types';
import {
  assertInsecureClientIntegrationsAllowed,
  isInsecureClientIntegrationsEnabled,
} from '../config/runtimeFlags';

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      epic: {
        type: Type.STRING,
        description: 'The high-level epic title that groups related features.',
      },
      epic_description: {
        type: Type.STRING,
        description: 'A brief, one-sentence description of the epic.',
      },
      features: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            feature: {
              type: Type.STRING,
              description: 'The title of a specific feature within the epic.',
            },
            feature_description: {
              type: Type.STRING,
              description: 'A brief, one-sentence description of the feature.',
            },
            user_stories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: {
                    type: Type.STRING,
                    description: "A unique identifier for the user story (e.g., 'STORY-001')."
                  },
                  story: {
                    type: Type.STRING,
                    description: "The user story written in the format: 'As a [user type], I want to [action] so that [benefit]'.",
                  },
                  acceptance_criteria: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.STRING,
                    },
                    description: 'A list of specific, testable acceptance criteria for the user story.',
                  },
                  business_value: {
                    type: Type.STRING,
                    description: "The estimated business value of the story, must be one of: 'High', 'Medium', or 'Low'."
                  },
                  risk_impact: {
                    type: Type.STRING,
                    description: "The estimated risk or technical impact of the story, must be one of: 'High', 'Medium', or 'Low'."
                  },
                  dependencies: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING
                    },
                    description: "A list of other story 'id's that this story depends on. Can be an empty array if there are no dependencies."
                  }
                },
                required: ['id', 'story', 'acceptance_criteria', 'business_value', 'risk_impact', 'dependencies'],
              },
            },
          },
          required: ['feature', 'feature_description', 'user_stories'],
        },
      },
    },
    required: ['epic', 'epic_description', 'features'],
  },
};

function getGeminiClient(): GoogleGenAI {
  assertInsecureClientIntegrationsAllowed('Story generation');

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'VITE_GEMINI_API_KEY is not set. For local demos only, add it to .env.local ' +
      'together with VITE_ALLOW_INSECURE_CLIENT_LLM=true. Shared deploys must use a backend proxy.'
    );
  }

  return new GoogleGenAI({ apiKey });
}

export async function generateStories(userInput: string, knowledgeBase: string): Promise<Epic[]> {
    if (!isInsecureClientIntegrationsEnabled()) {
      assertInsecureClientIntegrationsAllowed('Story generation');
    }

    const ai = getGeminiClient();

    const prompt = `
      You are an expert AI Shadow Product Owner. Your primary function is to assist agile teams by reducing dependency on the human Product Owner for day-to-day backlog grooming.
      
      Analyze the provided business requirements and the supplementary knowledge base (which may contain past tickets, domain notes, etc.). Your task is to break down the requirements into a detailed, well-structured agile backlog in a JSON format.

      For each Epic, you must:
      1.  Define a clear 'epic' title and a concise 'epic_description'.
      2.  Break it down into multiple, logical 'features'.
      3.  For each feature, create several detailed 'user_stories'.
      
      For each User Story, you MUST:
      1.  Assign a unique 'id' (e.g., 'STORY-001', 'STORY-002').
      2.  Write the 'story' in the standard format: "As a [user type], I want to [action] so that [benefit]".
      3.  Provide a list of specific, testable 'acceptance_criteria'.
      4.  Tag the story with a 'business_value' ('High', 'Medium', or 'Low').
      5.  Tag the story with a 'risk_impact' ('High', 'Medium', or 'Low') based on complexity or potential issues.
      6.  Suggest 'dependencies' by listing the 'id's of any other user stories that must be completed first. If there are no dependencies, provide an empty array.
      
      Use the knowledge base to provide clarifications and generate more accurate, context-aware stories. Your output must be a JSON array of objects that strictly follows the provided schema.

      Business Requirement:
      ---
      ${userInput}
      ---

      Knowledge Base / Additional Context:
      ---
      ${knowledgeBase || 'No additional context provided.'}
      ---
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.4,
            },
        });
        
        const jsonText = response.text.trim();
        const parsedResponse = JSON.parse(jsonText);

        return parsedResponse as Epic[];

    } catch (error) {
        if (error instanceof Error && error.message.includes('blocked')) {
          throw error;
        }
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to generate stories from the API.");
    }
}
