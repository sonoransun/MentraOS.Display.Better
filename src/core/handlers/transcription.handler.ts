import { AppSession } from '@mentra/sdk';
import { logger } from '../../infrastructure/logging/logger';
import { sessionStore } from '../../infrastructure/storage/session.store';
import { ConversationEntry, Intent, SessionContext } from '../../types';
import ErrorHandler from '../../utils/error-handler';

interface TranscriptionData {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: Date;
  language?: string;
}

interface ProcessedTranscription {
  originalText: string;
  processedText: string;
  intent?: Intent;
  entities: Array<{ type: string; value: string; confidence: number }>;
  sentiment: { label: string; score: number };
  language: string;
  confidence: number;
}

class TranscriptionHandler {
  private readonly aiService: any; // Will be injected when AI services are created

  constructor() {
    // Initialize with circuit breaker for reliability
    this.processTranscription = ErrorHandler.createCircuitBreaker('transcription-processing')(
      this.processTranscription.bind(this)
    );
  }

  /**
   * Handle transcription events from MentraOS glasses
   */
  public async handleTranscription(
    session: AppSession,
    sessionId: string,
    data: any
  ): Promise<void> {
    try {
      const transcriptionData: TranscriptionData = {
        text: data.text,
        isFinal: data.isFinal,
        confidence: data.confidence || 0.8,
        timestamp: new Date(),
        language: data.language || 'en',
      };

      logger.logUserAction('transcription_received', sessionId, 'system', {
        text: transcriptionData.text,
        isFinal: transcriptionData.isFinal,
        confidence: transcriptionData.confidence,
      });

      // Get session context
      const sessionContext = await sessionStore.getSession(sessionId);
      if (!sessionContext) {
        logger.warn('Session not found for transcription', { sessionId });
        return;
      }

      // Process transcription if it's final
      if (transcriptionData.isFinal) {
        const processed = await this.processTranscription(transcriptionData, sessionContext);
        await this.handleProcessedTranscription(session, sessionId, sessionContext, processed);
      } else {
        // Show real-time transcription for immediate feedback
        await this.showRealtimeTranscription(session, transcriptionData);
      }

      // Update conversation history
      await this.updateConversationHistory(sessionId, transcriptionData);

    } catch (error) {
      logger.error('Failed to handle transcription', error as Error, { sessionId });
      await this.showErrorMessage(session, 'Failed to process speech input');
    }
  }

  /**
   * Process transcription with AI/NLP capabilities
   */
  private async processTranscription(
    data: TranscriptionData,
    context: SessionContext
  ): Promise<ProcessedTranscription> {
    const timer = logger.time('transcription-processing');

    try {
      // Basic processing for now - will be enhanced with AI services
      const processed: ProcessedTranscription = {
        originalText: data.text,
        processedText: data.text.trim(),
        entities: await this.extractEntities(data.text),
        sentiment: await this.analyzeSentiment(data.text),
        language: data.language || 'en',
        confidence: data.confidence,
      };

      // Intent detection
      processed.intent = await this.detectIntent(data.text, context);

      timer();
      return processed;

    } catch (error) {
      timer();
      logger.error('Failed to process transcription', error as Error);

      // Return basic processed version on error
      return {
        originalText: data.text,
        processedText: data.text.trim(),
        entities: [],
        sentiment: { label: 'neutral', score: 0.5 },
        language: data.language || 'en',
        confidence: data.confidence,
      };
    }
  }

  /**
   * Handle processed transcription with intelligent responses
   */
  private async handleProcessedTranscription(
    session: AppSession,
    sessionId: string,
    context: SessionContext,
    processed: ProcessedTranscription
  ): Promise<void> {
    // Check if user preferences include auto-translation
    if (context.preferences.ai.autoTranslation && processed.language !== context.preferences.language) {
      const translated = await this.translateText(processed.processedText, context.preferences.language);
      if (translated) {
        await this.showTranslatedText(session, processed.processedText, translated, processed.language);
        return;
      }
    }

    // Handle intent-based responses
    if (processed.intent && processed.intent.confidence > 0.7) {
      await this.handleIntentBasedResponse(session, sessionId, processed.intent);
      return;
    }

    // Show enhanced transcription with context
    await this.showEnhancedTranscription(session, processed, context);
  }

  /**
   * Show real-time transcription feedback
   */
  private async showRealtimeTranscription(
    session: AppSession,
    data: TranscriptionData
  ): Promise<void> {
    try {
      await session.layouts.showTextWall(
        `Listening: ${data.text}...`,
        {
          view: 'transcription',
          durationMs: 1000,
          style: {
            fontSize: '14px',
            opacity: 0.8,
            position: 'bottom-left',
          },
        }
      );
    } catch (error) {
      logger.warn('Failed to show real-time transcription', error as Error);
    }
  }

  /**
   * Show enhanced transcription with AI insights
   */
  private async showEnhancedTranscription(
    session: AppSession,
    processed: ProcessedTranscription,
    context: SessionContext
  ): Promise<void> {
    try {
      let displayText = `You said: "${processed.processedText}"`;

      // Add sentiment if significant
      if (processed.sentiment.score < 0.3 || processed.sentiment.score > 0.7) {
        displayText += `\n(${processed.sentiment.label})`;
      }

      // Add entities if found
      if (processed.entities.length > 0) {
        const entityText = processed.entities
          .filter(e => e.confidence > 0.7)
          .map(e => `${e.type}: ${e.value}`)
          .join(', ');
        if (entityText) {
          displayText += `\nFound: ${entityText}`;
        }
      }

      await session.layouts.showTextWall(displayText, {
        view: 'main',
        durationMs: 3000,
        style: {
          fontSize: context.preferences.accessibility.fontSize,
          color: this.getSentimentColor(processed.sentiment),
        },
      });

    } catch (error) {
      logger.error('Failed to show enhanced transcription', error as Error);
      // Fallback to basic display
      await session.layouts.showTextWall(`You said: ${processed.processedText}`, {
        view: 'main',
        durationMs: 3000,
      });
    }
  }

  /**
   * Show translated text
   */
  private async showTranslatedText(
    session: AppSession,
    original: string,
    translated: string,
    originalLanguage: string
  ): Promise<void> {
    try {
      const displayText = `${original}\n↓\n${translated}`;

      await session.layouts.showTextWall(displayText, {
        view: 'main',
        durationMs: 5000,
        style: {
          fontSize: '16px',
          color: '#4CAF50',
        },
      });

    } catch (error) {
      logger.error('Failed to show translated text', error as Error);
    }
  }

  /**
   * Handle intent-based responses
   */
  private async handleIntentBasedResponse(
    session: AppSession,
    sessionId: string,
    intent: Intent
  ): Promise<void> {
    try {
      let responseText = '';

      switch (intent.action) {
        case 'greeting':
          responseText = 'Hello! How can I assist you today?';
          break;

        case 'time_query':
          responseText = `Current time: ${new Date().toLocaleTimeString()}`;
          break;

        case 'weather_query':
          responseText = 'Weather functionality coming soon!';
          break;

        case 'navigation':
          responseText = 'Navigation assistance available. Please specify your destination.';
          break;

        case 'help':
          responseText = 'Available commands: time, weather, navigation, translate, or just speak naturally!';
          break;

        case 'translate':
          const targetLanguage = intent.parameters.language || 'es';
          const textToTranslate = intent.parameters.text || 'Hello';
          const translated = await this.translateText(textToTranslate, targetLanguage);
          responseText = translated ? `Translation: ${translated}` : 'Translation failed';
          break;

        default:
          responseText = `I understand you want to: ${intent.action}. Let me help with that!`;
      }

      await session.layouts.showTextWall(responseText, {
        view: 'main',
        durationMs: 4000,
        style: {
          fontSize: '16px',
          color: '#2196F3',
        },
      });

      logger.logAIOperation('intent_response', sessionId, 0, true, { intent, response: responseText });

    } catch (error) {
      logger.error('Failed to handle intent-based response', error as Error, { intent });
    }
  }

  /**
   * Extract entities from text (basic implementation)
   */
  private async extractEntities(text: string): Promise<Array<{ type: string; value: string; confidence: number }>> {
    const entities = [];

    // Basic regex-based entity extraction (will be enhanced with AI)
    const timeRegex = /\b(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?|\d{1,2}\s*(?:AM|PM))\b/gi;
    const dateRegex = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4}|(?:today|tomorrow|yesterday))\b/gi;
    const numberRegex = /\b(\d+(?:\.\d+)?)\b/g;

    let match;

    // Extract times
    while ((match = timeRegex.exec(text)) !== null) {
      entities.push({
        type: 'time',
        value: match[1],
        confidence: 0.8,
      });
    }

    // Extract dates
    while ((match = dateRegex.exec(text)) !== null) {
      entities.push({
        type: 'date',
        value: match[1],
        confidence: 0.8,
      });
    }

    // Extract numbers
    while ((match = numberRegex.exec(text)) !== null) {
      entities.push({
        type: 'number',
        value: match[1],
        confidence: 0.7,
      });
    }

    return entities;
  }

  /**
   * Analyze sentiment (basic implementation)
   */
  private async analyzeSentiment(text: string): Promise<{ label: string; score: number }> {
    // Basic sentiment analysis (will be enhanced with AI)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'happy', 'love', 'like', 'awesome'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'angry', 'sad', 'frustrated', 'annoyed'];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) {
      return { label: 'neutral', score: 0.5 };
    }

    const score = positiveCount / total;
    let label = 'neutral';

    if (score > 0.6) label = 'positive';
    else if (score < 0.4) label = 'negative';

    return { label, score };
  }

  /**
   * Detect user intent (basic implementation)
   */
  private async detectIntent(text: string, context: SessionContext): Promise<Intent | undefined> {
    const lowerText = text.toLowerCase();

    // Basic intent patterns (will be enhanced with AI)
    const intentPatterns = [
      { pattern: /\b(hello|hi|hey|greetings)\b/i, action: 'greeting', confidence: 0.9 },
      { pattern: /\b(time|what time|current time)\b/i, action: 'time_query', confidence: 0.9 },
      { pattern: /\b(weather|temperature|forecast)\b/i, action: 'weather_query', confidence: 0.8 },
      { pattern: /\b(navigate|directions|go to|find)\b/i, action: 'navigation', confidence: 0.8 },
      { pattern: /\b(help|assist|what can you)\b/i, action: 'help', confidence: 0.9 },
      { pattern: /\b(translate|translation)\b/i, action: 'translate', confidence: 0.8 },
    ];

    for (const { pattern, action, confidence } of intentPatterns) {
      const match = pattern.exec(lowerText);
      if (match) {
        return {
          action,
          confidence,
          parameters: this.extractIntentParameters(text, action),
          timestamp: new Date(),
        };
      }
    }

    return undefined;
  }

  /**
   * Extract parameters for specific intents
   */
  private extractIntentParameters(text: string, action: string): Record<string, any> {
    const parameters: Record<string, any> = {};

    switch (action) {
      case 'translate':
        const languageMatch = /\b(?:to|in)\s+(\w+)\b/i.exec(text);
        if (languageMatch) {
          parameters.language = languageMatch[1].toLowerCase();
        }
        break;

      case 'navigation':
        const locationMatch = /\b(?:to|find)\s+(.+?)(?:\s|$)/i.exec(text);
        if (locationMatch) {
          parameters.destination = locationMatch[1].trim();
        }
        break;
    }

    return parameters;
  }

  /**
   * Translate text (placeholder implementation)
   */
  private async translateText(text: string, targetLanguage: string): Promise<string | null> {
    try {
      // Placeholder - will be implemented with actual translation service
      logger.info('Translation requested', {
        component: 'transcription-handler',
        text,
        targetLanguage,
      });

      // Basic mock translations for demo
      if (targetLanguage === 'es' && text.toLowerCase().includes('hello')) {
        return 'Hola';
      }

      return null;
    } catch (error) {
      logger.error('Translation failed', error as Error);
      return null;
    }
  }

  /**
   * Update conversation history
   */
  private async updateConversationHistory(
    sessionId: string,
    data: TranscriptionData
  ): Promise<void> {
    try {
      if (!data.isFinal) return;

      const conversationEntry: ConversationEntry = {
        id: `${sessionId}-${Date.now()}`,
        timestamp: data.timestamp,
        type: 'user',
        content: data.text,
        metadata: {
          confidence: data.confidence,
          language: data.language,
        },
      };

      // Update session with new conversation entry
      const sessionContext = await sessionStore.getSession(sessionId);
      if (sessionContext) {
        sessionContext.state.aiContext.conversationHistory.push(conversationEntry);

        // Keep only last 50 conversation entries
        if (sessionContext.state.aiContext.conversationHistory.length > 50) {
          sessionContext.state.aiContext.conversationHistory =
            sessionContext.state.aiContext.conversationHistory.slice(-50);
        }

        await sessionStore.updateSession(sessionId, sessionContext);
      }

    } catch (error) {
      logger.error('Failed to update conversation history', error as Error, { sessionId });
    }
  }

  /**
   * Show error message to user
   */
  private async showErrorMessage(session: AppSession, message: string): Promise<void> {
    try {
      await session.layouts.showTextWall(message, {
        view: 'main',
        durationMs: 3000,
        style: {
          color: '#f44336',
          fontSize: '16px',
        },
      });
    } catch (error) {
      logger.error('Failed to show error message', error as Error);
    }
  }

  /**
   * Get color based on sentiment
   */
  private getSentimentColor(sentiment: { label: string; score: number }): string {
    switch (sentiment.label) {
      case 'positive':
        return '#4CAF50';
      case 'negative':
        return '#f44336';
      default:
        return '#ffffff';
    }
  }
}

export default TranscriptionHandler;