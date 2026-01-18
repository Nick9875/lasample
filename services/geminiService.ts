
import { GoogleGenAI } from "@google/genai";
import { Equipment, Reading, ThresholdSettings } from "../types";

export const performAIDiagnostic = async (
  equipment: Equipment,
  readings: Reading[],
  settings: ThresholdSettings
) => {
  // Always use process.env.API_KEY as a named parameter in the constructor.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Perform a professional engineering diagnostic on this Lightning Arrester:
    Equipment: ${JSON.stringify(equipment)}
    Readings History: ${JSON.stringify(readings)}
    Thresholds: Poor > ${settings.poorLimit}uA, Critical > ${settings.criticalLimit}uA.

    Based on the trend of Corrected Resistive Current (uA), provide:
    1. A summary of the current state.
    2. Identification of any dangerous trends (e.g., rapid increases).
    3. Recommended maintenance actions.
    4. Estimated remaining life or urgency of replacement.
    
    Keep the response technical but easy for a technician to act upon.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      }
    });

    // Use the .text property to extract output string.
    return response.text || "Diagnostic unavailable at this moment.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating diagnostic. Please check your connection or API configuration.";
  }
};

export const performAIComparison = async (
  items: { equipment: Equipment; readings: Reading[] }[],
  settings: ThresholdSettings
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Perform a professional comparative engineering diagnostic on the following ${items.length} Lightning Arrester units:

    ${items.map((item, i) => `
    UNIT ${i + 1} [${item.equipment.name}]:
    - Metadata: ${JSON.stringify(item.equipment)}
    - Readings History: ${JSON.stringify(item.readings)}
    `).join('\n')}

    Thresholds: Poor > ${settings.poorLimit}uA, Critical > ${settings.criticalLimit}uA.

    Based on the trends of Corrected Resistive Current (uA) and equipment metadata, provide:
    1. A comparative health summary table or list.
    2. Analysis of the relative performance: identify which unit is degrading fastest.
    3. If units are of different brands/models, note any performance discrepancies.
    4. Specific maintenance prioritization among these ${items.length} units.
    
    Keep the response technical, comparative, and actionable for substation maintenance teams.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
      }
    });

    return response.text || "Comparison diagnostic unavailable.";
  } catch (error) {
    console.error("Gemini Comparison Error:", error);
    return "Error generating comparison. Please check your connection.";
  }
};
