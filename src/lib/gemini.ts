import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio,
          },
        },
        {
          text: "Please transcribe the provided audio into written Burmese text. Only return the transcription, nothing else. If you detect other languages, translate or transcribe them into Burmese context if possible, but prioritize the original spoken words in Burmese.",
        },
      ],
    });

    return response.text ?? "Transcription failed.";
  } catch (error) {
    console.error("Transcription Error:", error);
    throw new Error("Failed to transcribe audio. Please try again.");
  }
}

export async function translateText(text: string, direction: 'en-my' | 'my-en'): Promise<string> {
  try {
    const targetLang = direction === 'en-my' ? 'Burmese (Unicode)' : 'English';
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text to ${targetLang}. Provide a high-quality, natural translation. Only return the translated text.\n\nText: ${text}`,
    });
    return response.text ?? "Translation failed.";
  } catch (error) {
    console.error("Translation Error:", error);
    throw new Error("Failed to translate text.");
  }
}

export async function textToSpeech(text: string): Promise<string> {
  try {
    // Note: TTS model 'gemini-3.1-flash-tts-preview' handles the request.
    // We request Cheerful voice 'Kore' as example. 
    // You can adjust prompt to suggest emotion or use specific speaker.
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: ["AUDIO" as any], // Modality.AUDIO is not exported in some versions but "AUDIO" as string works
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned.");
    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    throw new Error("Failed to generate speech.");
  }
}
