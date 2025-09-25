// server.js

// Import necessary libraries
const express = require('express');
const { Pool } = require('pg');
const { OpenAIEmbeddings, ChatOpenAI } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const fs = require('fs');
const path = require('path');
// Use dotenv to load environment variables from the .env file
require('dotenv').config();

// Initialize the Express application and set the port
const app = express();
const port = process.env.PORT || 8888; // Use environment variable for port, or default to 8888

// Middleware to parse JSON requests and serve static files from the 'public' directory
app.use(express.json());
app.use(express.static('public'));

// Configure the PostgreSQL connection pool using environment variables
const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
});

// Initialize OpenAI clients for embeddings and chat completions
// OpenAIEmbeddings for generating vector representations of text
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002",
});

// ChatOpenAI for the LLM to generate answers. Using ChatOpenAI as gpt-4o is a chat model.
const model = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o",
    temperature: 0.2, // Lower temperature for more consistent, factual answers
});

// --- Ingestion Endpoint ---
// This API call handles reading the document, chunking it, embedding it, and storing it in the database.
app.post('/api/ingest', async (req, res) => {
  try {
    // Define the path to the document file
    const documentPath = path.join(__dirname, 'Amazon-com-I-Report.txt');
    const documentText = fs.readFileSync(documentPath, 'utf-8');

    // Step 1: Chunking the document
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000, // The maximum size of each text chunk
      chunkOverlap: 200, // The number of characters to overlap between chunks
    });
    const chunks = await splitter.splitText(documentText);
    console.log(`Split document into ${chunks.length} chunks.`);

    // Step 2: Optimized Embedding and Bulk Insertion
    // Batch embed all chunks at once to reduce API latency
    const allEmbeddings = await embeddings.embedDocuments(chunks);
    
    // Create a single SQL query for efficient bulk insertion
    const values = allEmbeddings.map((embedding, index) => {
      // Escape single quotes in the text content to prevent SQL injection errors
      const escapedContent = chunks[index].replace(/'/g, "''");
      // Format the embedding array as a string and cast it to the vector type
      return `('${escapedContent}', '${JSON.stringify(embedding)}'::vector)`;
    });

    // Clear existing data and insert the new data in one atomic operation
    await pool.query('DELETE FROM chunks;');
    const insertQuery = `INSERT INTO chunks (content, embedding) VALUES ${values.join(',')};`;
    await pool.query(insertQuery);

    res.status(200).send({ message: 'Document ingested successfully.' });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).send({ message: 'Ingestion failed.', error: error.message });
  }
});

// --- RAG Query Endpoint ---
// This API call handles the user's question, retrieves relevant context, and generates an answer.
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).send({ message: 'Query is required.' });
  }

  try {
    // Step 1: Embed the user's query
    const queryEmbedding = await embeddings.embedQuery(query);

    // Step 2: Retrieve top 5 most similar chunks from the database
    // The <=> operator calculates cosine distance. We subtract from 1 to get a similarity score.
    const { rows } = await pool.query(
      `SELECT content, 1 - (embedding <=> $1::vector) as similarity_score
       FROM chunks
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
       // Cast the query embedding to a vector type in the SQL query
      [JSON.stringify(queryEmbedding)]
    );

    // Map the query results into a cleaner format
    const retrievedChunks = rows.map(row => ({
      text: row.content,
      score: row.similarity_score,
    }));
    
    // Step 2b: Re-ranking and selection
    // Select the top 3 chunks to send to the LLM as context (a simplified re-ranking step)
    const topChunks = retrievedChunks.slice(0, 3);

    // Step 3: Format the context for the LLM prompt
    const context = topChunks.map(chunk => chunk.text).join('\n\n---\n\n');
    const prompt = `You are a helpful assistant. Use the following pieces of context to answer the question.
If you don't know the answer, just say that you don't know. Do not make up an answer.
----------------
Context:
${context}
----------------
Question: ${query}
`;

    // Step 4: Call the LLM to generate the final answer
    const llmResponse = await model.invoke(prompt);
    const finalAnswer = llmResponse.content.trim();

    // Send the final answer and all considered chunks back to the client
    res.status(200).send({
      answer: finalAnswer,
      chunks: retrievedChunks,
      highlightedChunks: topChunks, // Used by the frontend to highlight chunks
    });
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).send({ message: 'Failed to process query.', error: error.message });
  }
});

// --- Start the server ---
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});