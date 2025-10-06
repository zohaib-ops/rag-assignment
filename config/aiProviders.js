const { OpenAIEmbeddings, ChatOpenAI } = require('@langchain/openai');
const { ChatAnthropic } = require('@langchain/anthropic');

/**
 * AI Provider configurations
 */
const AI_PROVIDERS = {
  openai: {
    chat: {
      class: ChatOpenAI,
      config: {
        apiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-4o",
        temperature: 0.2,
      },
      pricing: {
        promptTokenCost: 0.000005,
        completionTokenCost: 0.000015
      }
    },
    embeddings: {
      class: OpenAIEmbeddings,
      config: {
        apiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-ada-002",
      }
    }
  },
  
  anthropic: {
    chat: {
      class: ChatAnthropic,
      config: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        modelName: "claude-3-5-sonnet-20241022", // Updated to newer model
        temperature: 0.2,
        maxTokens: 1000,
      },
      pricing: {
        promptTokenCost: 0.000003,
        completionTokenCost: 0.000015
      }
    },
    embeddings: {
      // Anthropic doesn't have embeddings, fallback to OpenAI
      class: OpenAIEmbeddings,
      config: {
        apiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-ada-002",
      }
    }
  }
};

/**
 * Factory function to create AI provider instances
 */
class AIProviderFactory {
  static createChatModel(providerName = 'openai') {
    const provider = AI_PROVIDERS[providerName];
    if (!provider || !provider.chat) {
      throw new Error(`Chat model not supported for provider: ${providerName}`);
    }
    
    const { class: ModelClass, config } = provider.chat;
    return new ModelClass(config);
  }
  
  static createEmbeddingModel(providerName = 'openai') {
    const provider = AI_PROVIDERS[providerName];
    if (!provider || !provider.embeddings) {
      throw new Error(`Embedding model not supported for provider: ${providerName}`);
    }
    
    const { class: EmbeddingClass, config } = provider.embeddings;
    return new EmbeddingClass(config);
  }
  
  static calculateCost(promptTokens, completionTokens, providerName = 'openai') {
    const provider = AI_PROVIDERS[providerName];
    if (!provider || !provider.chat.pricing) {
      return 0;
    }
    
    const { promptTokenCost, completionTokenCost } = provider.chat.pricing;
    return (promptTokens * promptTokenCost) + (completionTokens * completionTokenCost);
  }
  
  static getProviderInfo(providerName = 'openai') {
    const provider = AI_PROVIDERS[providerName];
    return {
      name: providerName,
      chatModel: provider?.chat?.config?.modelName || 'unknown',
      embeddingModel: provider?.embeddings?.config?.modelName || 'unknown'
    };
  }
  
  static isProviderConfigured(providerName) {
    const provider = AI_PROVIDERS[providerName];
    if (!provider) return false;
    
    // Check if required API keys are present
    if (providerName === 'openai') {
      return !!process.env.OPENAI_API_KEY;
    }
    if (providerName === 'anthropic') {
      return !!process.env.ANTHROPIC_API_KEY && !!process.env.OPENAI_API_KEY; // Need both for embeddings
    }
    
    return false;
  }
}

module.exports = {
  AIProviderFactory,
  AI_PROVIDERS
};