
// server.js
require('dotenv').config();

// In your RAG assignment code
const { TestOps, initautopatch } = require('testops');

// Initialize auto-instrumentation for AI tracing
initautopatch();

// Create TestOps client (optional - only if you need manual traces)
// const testops = new TestOps({
//   publicKey: process.env.TESTOPS_PUBLIC_KEY,
//   secretKey: process.env.TESTOPS_SECRET_KEY,
//   baseUrl: process.env.TESTOPS_BASE_URL || 'http://localhost:3000'
// });

// Your RAG logic here - all AI calls will be automatically traced!

// Import necessary libraries
const express = require('express');
const { Pool } = require('pg');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const fs = require('fs');
const path = require('path');

// Import AI Provider Factory
const { AIProviderFactory } = require('./config/aiProviders');

const app = express();
const port = process.env.PORT || 4444;

app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
});

// Configuration: Choose your AI provider here
const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic'; // 'openai' or 'anthropic'

// Check if provider is configured
if (!AIProviderFactory.isProviderConfigured(AI_PROVIDER)) {
  console.error(`❌ Provider '${AI_PROVIDER}' is not properly configured. Check your environment variables.`);
  if (AI_PROVIDER === 'anthropic') {
    console.error('Required: ANTHROPIC_API_KEY and OPENAI_API_KEY (for embeddings)');
  } else if (AI_PROVIDER === 'openai') {
    console.error('Required: OPENAI_API_KEY');
  }
  process.exit(1);
}

// Initialize AI models using the factory
const embeddings = AIProviderFactory.createEmbeddingModel(AI_PROVIDER);
const model = AIProviderFactory.createChatModel(AI_PROVIDER);
const providerInfo = AIProviderFactory.getProviderInfo(AI_PROVIDER);

console.log(`🤖 Using AI Provider: ${providerInfo.name}`);
console.log(`💬 Chat Model: ${providerInfo.chatModel}`);
console.log(`🔍 Embedding Model: ${providerInfo.embeddingModel}`);


// --- Ingestion Endpoint ---
app.post('/api/ingest', async (req, res) => {
  try {
    const documentPath = path.join(__dirname, 'Amazon-com-I-Report.txt');
    const documentText = fs.readFileSync(documentPath, 'utf-8');

    // Document chunking
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitText(documentText);

    // Embedding generation - TestOps will automatically trace AI calls
    const allEmbeddings = await embeddings.embedDocuments(chunks);
    
    // Database insertion
    const values = allEmbeddings.map((embedding, index) => {
      const escapedContent = chunks[index].replace(/'/g, "''");
      return `('${escapedContent}', '${JSON.stringify(embedding)}'::vector)`;
    });
    
    await pool.query('DELETE FROM chunks;');
    const insertQuery = `INSERT INTO chunks (content, embedding) VALUES ${values.join(',')};`;
    await pool.query(insertQuery);
    
    res.status(200).send({
      message: 'Document ingested successfully',
      chunks_processed: chunks.length,
      embeddings_generated: allEmbeddings.length
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).send({ message: 'Ingestion failed.', error: error.message });
  }
});

// --- RAG Query Endpoint ---
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).send({ message: 'Query is required.' });
  }

  try {
    // Query embedding - TestOps will automatically trace this AI call
    const queryEmbedding = await embeddings.embedQuery(query);

    // Database search for similar chunks
    const { rows } = await pool.query(
      `SELECT content, 1 - (embedding <=> $1::vector) as similarity_score
      FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT 5`,
      [JSON.stringify(queryEmbedding)]
    );

    const retrievedChunks = rows.map(row => ({
      text: row.content,
      score: row.similarity_score,
    }));
    
    const topChunks = retrievedChunks.slice(0, 3);

    // LLM Generation - TestOps will automatically trace this AI call
    const context = topChunks.map(chunk => chunk.text).join('\n\n---\n\n');
    const prompt = `You are a helpful assistant. Use the following pieces of context to answer the question.
If you don't know the answer, just say that you don't know. Do not make up an answer.
----------------
Context:\n${context}\n----------------\nQuestion: ${query}\n`;

    const llmResponse = await model.invoke(prompt);
    const finalAnswer = llmResponse.content.trim();

    res.status(200).send({
      answer: finalAnswer,
      chunks: retrievedChunks,
      highlightedChunks: topChunks,
    });
    
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).send({ 
      message: 'Failed to process query.', 
      error: error.message,
      answer: 'Failed to generate answer.',
    });
  }
});

// --- Start the server ---
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});



