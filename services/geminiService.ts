import { GoogleGenAI } from "@google/genai";
import { Equipment, Reading, ThresholdSettings } from "../types";

export const performAIDiagnostic = async (
  equipment: Equipment,
  readings: Reading[],
  settings: ThresholdSettings,
  additionalContext?: string
) => {
  // Always use process.env.API_KEY as a named parameter in the constructor.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Perform a professional engineering diagnostic on this Lightning Arrester:
    Equipment: ${JSON.stringify(equipment)}
    Readings History: ${JSON.stringify(readings)}
    Thresholds: Poor > ${settings.poorLimit}uA, Critical > ${settings.criticalLimit}uA.

    ${additionalContext ? `Technician's Field Observations / Additional Context: "${additionalContext}"` : ''}

    Based on the trend of Corrected Resistive Current (uA) and any provided observations, provide:
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

export const extractReadingFromImage = async (base64Image: string, providedMimeType?: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Remove data URI prefix if present
  const base64Data = base64Image.replace(/^data:.*?;base64,/, '');
  const mimeType = providedMimeType || base64Image.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';
  
  const prompt = `
    Analyze this document or image of an instrument display (like a Leakage Current Monitor).
    Extract the following numerical values if they are visible:
    - Total Leakage Current (usually labeled as Total Current, mA or uA)
    - Resistive Current (usually labeled Ir or Resistive, uA or mA)
    - Corrected Resistive Current (usually labeled as Corrected, uA or mA)

    Respond ONLY with a valid JSON object matching this structure exactly (use null if a value is not found, make sure all numbers are in uA, assuming 1mA = 1000uA if needed):
    {
      "totalLeakageCurrent": number | null,
      "resistiveCurrent": number | null,
      "correctedResistiveCurrent": number | null
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: prompt },
        { 
          inlineData: { 
            data: base64Data, 
            mimeType: mimeType 
          } 
        }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    return null;
  }
};

export const extractBatchReadingsFromDocument = async (base64Data: string, mimeType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Remove data URI prefix if present
  const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, '');
  
  const prompt = `
    Analyze this document (image or PDF) containing tabular data of lightning arrester readings.
    Extract all the readings you can find. 
    Typically, a row might contain an equipment identifier or asset name, and numerical values for Total Leakage Current, Resistive Current, and Corrected Resistive Current.
    
    Extract the list of readings.
    Respond ONLY with a valid JSON array of objects. Use this structure exactly. 
    If a value is not found, use null or an empty string. Make sure all numbers are in uA.
    [
      {
        "equipmentName": "string or null",
        "totalLeakageCurrent": number | null,
        "resistiveCurrent": number | null,
        "correctedResistiveCurrent": number | null
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: prompt },
        { 
          inlineData: { 
            data: cleanBase64, 
            mimeType: mimeType 
          } 
        }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini OCR Batch Error:", error);
    return null;
  }
};

export const performAIComparison = async (
  items: { equipment: Equipment; readings: Reading[] }[],
  settings: ThresholdSettings,
  additionalContext?: string
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Perform a professional comparative engineering diagnostic on the following ${items.length} Lightning Arrester units:

    ${items.map((item, i) => `
    UNIT ${i + 1} [${item.equipment.name}]:
    - Metadata: ${JSON.stringify(item.equipment)}
    - Readings History: ${JSON.stringify(item.readings)}
    `).join('\\n')}

    Thresholds: Poor > ${settings.poorLimit}uA, Critical > ${settings.criticalLimit}uA.

    ${additionalContext ? `Technician's Field Observations / Additional Context: "${additionalContext}"` : ''}

    Based on the trends of Corrected Resistive Current (uA), equipment metadata, and any provided observations, provide:
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
