// AI Co-Pilot & Script/Lyric Assistant Module

class StudioAIAssistant {
    constructor() {
        // Retrieve saved API key or prompt mode from local storage
        this.apiKey = localStorage.getItem('studio_ai_key') || '';
        this.provider = localStorage.getItem('studio_ai_provider') || 'grok'; // options: 'grok', 'openai', 'gemini'
    }

    setCredentials(provider, apiKey) {
        this.provider = provider;
        this.apiKey = apiKey;
        localStorage.setItem('studio_ai_provider', provider);
        localStorage.setItem('studio_ai_key', apiKey);
        console.log(`AI Assistant configured with ${provider}`);
    }

    async generateContent(promptType, userPrompt) {
        let systemPrompt = "";
        
        switch(promptType) {
            chno:
            case 'lyrics':
                systemPrompt = "You are an expert Caribbean music and hip-hop lyricist, specializing in catchy hooks, rhythmic flow, and Kwéyòl-infused phrasing.";
                break;
            case 'script':
                systemPrompt = "You are a professional film/video scriptwriter and voiceover director, creating punchy, engaging narration scripts.";
                break;
            case 'production':
                systemPrompt = "You are an audio engineer and multimedia producer advising on beat arrangements, vocal mixing, and visual chroma key settings.";
                break;
            default:
                systemPrompt = "You are a helpful creative AI co-pilot inside a web-based production suite.";
        }

        // If an API key is provided, query directly; otherwise, return a structured prompt helper
        if (!this.apiKey) {
            console.warn("No AI API key found. Returning prompt template.");
            return {
                status: "prompt_ready",
                prompt: `[System: ${systemPrompt}]\n\nUser Request: ${userPrompt}`
            };
        }

        try {
            // Example fetch setup for direct browser-to-API communication
            const response = await this.callAPI(systemPrompt, userPrompt);
            return { status: "success", result: response };
        } catch (error) {
            console.error("AI Generation Error:", error);
            return { status: "error", message: error.message };
        }
    }

    async callAPI(systemPrompt, userPrompt) {
        // Placeholder for direct REST endpoint calls (e.g., xAI, OpenAI, Gemini)
        if (this.provider === 'grok' || this.provider === 'openai') {
            const endpoint = this.provider === 'grok' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
            
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.provider === 'grok' ? 'grok-beta' : 'gpt-4o-mini',
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.7
                })
            });
            const data = await res.json();
            return data.choices[0].message.content;
        }
        throw new Error("Unsupported AI provider selected.");
    }
}

// Global instance helper
const studioAI = new StudioAIAssistant();
