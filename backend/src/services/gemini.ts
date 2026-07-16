import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import { timeoutSignal } from '../http/timeout.js';

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      epic: { type: Type.STRING },
      epic_description: { type: Type.STRING },
      features: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            feature: { type: Type.STRING },
            feature_description: { type: Type.STRING },
            user_stories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  story: { type: Type.STRING },
                  acceptance_criteria: { type: Type.ARRAY, items: { type: Type.STRING } },
                  business_value: { type: Type.STRING },
                  risk_impact: { type: Type.STRING },
                  dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  story_points: { type: Type.NUMBER },
                },
                required: [
                  'id',
                  'story',
                  'acceptance_criteria',
                  'business_value',
                  'risk_impact',
                  'dependencies',
                  'story_points',
                ],
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

export type GeneratedEpic = {
  epic: string;
  epic_description: string;
  features: Array<{
    feature: string;
    feature_description: string;
    user_stories: Array<{
      id: string;
      story: string;
      acceptance_criteria: string[];
      business_value: 'High' | 'Medium' | 'Low';
      risk_impact: 'High' | 'Medium' | 'Low';
      dependencies: string[];
      story_points: 1 | 2 | 3 | 5 | 8 | 13;
    }>;
  }>;
};

export async function generateStoriesServer(
  userInput: string,
  knowledgeBase: string,
  parentSignal?: AbortSignal
): Promise<GeneratedEpic[]> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const prompt = `
You are an expert AI Shadow Product Owner.
Break down the requirements into Epics → Features → User Stories as JSON matching the schema.
User stories must use "As a … I want … so that …", include acceptance criteria, business_value and risk_impact (High|Medium|Low), dependency ids, and story_points (Fibonacci: 1, 2, 3, 5, 8, or 13).

Business Requirement:
---
${userInput}
---

Knowledge Base:
---
${knowledgeBase || 'No additional context provided.'}
---
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.4,
      abortSignal: timeoutSignal(config.geminiTimeoutMs, parentSignal),
    },
  });

  const jsonText = (response.text ?? '').trim();
  if (!jsonText) {
    throw new Error('Empty response from Gemini');
  }
  return JSON.parse(jsonText) as GeneratedEpic[];
}

const storySchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    story: { type: Type.STRING },
    acceptance_criteria: { type: Type.ARRAY, items: { type: Type.STRING } },
    business_value: { type: Type.STRING },
    risk_impact: { type: Type.STRING },
    dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
    story_points: { type: Type.NUMBER },
  },
  required: [
    'id',
    'story',
    'acceptance_criteria',
    'business_value',
    'risk_impact',
    'dependencies',
    'story_points',
  ],
};

export type GeneratedStory = GeneratedEpic['features'][number]['user_stories'][number];

export async function refineStoryServer(
  input: {
    story: GeneratedStory;
    instruction: string;
    epicTitle: string;
    featureTitle: string;
  },
  parentSignal?: AbortSignal
): Promise<GeneratedStory> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = `
You are an expert AI Shadow Product Owner.
Refine ONLY the following user story per the instruction. Keep the same id.
Do not invent sibling stories. Preserve dependency ids unless the instruction requires changing them.
story_points must be one of 1, 2, 3, 5, 8, 13.

Epic context: ${input.epicTitle}
Feature context: ${input.featureTitle}

Current story JSON:
${JSON.stringify(input.story, null, 2)}

Refinement instruction:
${input.instruction}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: storySchema,
      temperature: 0.4,
      abortSignal: timeoutSignal(config.geminiTimeoutMs, parentSignal),
    },
  });

  const jsonText = (response.text ?? '').trim();
  if (!jsonText) throw new Error('Empty response from Gemini');
  const refined = JSON.parse(jsonText) as GeneratedStory;
  refined.id = input.story.id;
  return refined;
}

