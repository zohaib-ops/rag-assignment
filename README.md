# RAG Assignment: Document Q&A System

## Overview

This project is a Retrieval-Augmented Generation (RAG) system built to answer questions based on the content of a single, large document. The application features a simple web interface for user interaction and a robust backend that handles data ingestion, document chunking, and AI-powered question answering.

The core goal of this system is to ensure that the answers provided are directly sourced from the document, mitigating the risk of the LLM generating information from its general training data (hallucination).

## Features

* **Document Ingestion**: Processes a large text document, breaks it into manageable chunks, and stores it in a vector database.
* **Vector Database**: Utilizes **PostgreSQL with the `pgvector` extension** for efficient storage and retrieval of vector embeddings.
* **Intelligent Retrieval**: Performs a vector similarity search to find the most relevant document chunks for any user query.
* **Re-ranking**: A two-stage retrieval process ensures that only the highest-quality, most relevant context is passed to the LLM.
* **LLM Integration**: Uses a Large Language Model to synthesize a coherent and concise answer from the retrieved context.
* **Simple UI**: A web interface that allows users to ingest the document and ask questions, with a clear display of the final answer and the source chunks used to generate it.

## Technical Stack

* **Backend**: Node.js, Express.js
* **Frontend**: HTML, CSS, JavaScript
* **Database**: PostgreSQL with `pgvector` extension
* **LLM & Embeddings**: OpenAI's `gpt-4o` and `text-embedding-ada-002`
* **Libraries**: LangChain.js, `pg`, `dotenv`

## Setup and Installation

### Prerequisites

* Node.js (v18 or higher)
* PostgreSQL with `pgvector` extension enabled

### Steps

1.  **Clone the Repository**
    ```bash
    git clone [https://github.com/your_username/rag-assignment.git](https://github.com/your_username/rag-assignment.git)
    cd rag-assignment
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Database Configuration**
    * Create a database (e.g., `ragdb`).
    * Connect to the database and enable the `pgvector` extension.
    * Create the `chunks` table by running the following SQL commands:
    ```sql
    CREATE EXTENSION vector;
    CREATE TABLE chunks (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        embedding vector(1536)
    );
    ```

4.  **Environment Variables**
    * Create a `.env` file in the root directory.
    * Add your API keys and database credentials:
    ```env
    OPENAI_API_KEY="your-openai-api-key-here"
    PG_HOST="localhost"
    PG_USER="your-pg-username"
    PG_PASSWORD="your-pg-password"
    PG_DATABASE="ragdb"
    PG_PORT="5432"
    ```

5.  **Add Your Document**
    * Place your large text document (e.g., `Amazon-com-I-Report.txt`) in the root directory of the project.

6.  **Run the Server**
    ```bash
    node server.js
    ```
    The server will start and be accessible at `http://localhost:8888`.

## Usage

1.  Open your web browser and navigate to `http://localhost:8888`.
2.  Click the **"Ingest Document"** button to load your data into the vector database.
3.  Once the ingestion is complete, type a question into the text box and click **"Get Answer"** to test the RAG system. The UI will display the answer and highlight the specific chunks of text that were used to generate it.

## Author

* Zohaib Momin

**Flowchart**.


          ┌──────────────────────────────┐
          │         Document(s)          │
          └──────────────┬───────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │   Chunking Text    │  ← Split into small pieces
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │   Embeddings       │  ← Convert chunks into vectors
              └─────────┬──────────┘
                        │
                        ▼
        ┌──────────────────────────────────┐
        │   Vector Database (PGVector etc.)│
        └──────────────┬───────────────────┘
                       │
     ┌─────────────────┴─────────────────┐
     │                                   │
     ▼                                   ▼
User Question                     Question Embedding
     │                                   │
     └─────────────────┬─────────────────┘
                       ▼
              ┌────────────────────┐
              │ Retrieve Top-k Chunks│
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │  (Optional)        │
              │ Re-rank Chunks     │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ LLM (e.g., GPT-4)  │ ← Answer using chunks as context
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │   Final Answer     │
              └────────────────────┘




**High-Level Code Walkthrough
**
The codebase is split into a Node.js backend (server.js) and a simple HTML/JavaScript frontend (public/index.html).
* server.js (Backend): This is the core of the RAG system. It uses Express.js to handle two main API routes:
    * /api/ingest: This endpoint is responsible for data preparation. It reads the raw text from the document, uses a text splitter to break it into manageable chunks, generates vector embeddings for each chunk using OpenAI's model, and stores both the original text and its embedding in the PostgreSQL database table.
    * /api/query: This is the main RAG endpoint. When a user submits a question, it generates a vector embedding for the query, performs a vector similarity search in the database to find the most relevant document chunks, and then uses a prompt template to combine the retrieved chunks with the original question. It sends this combined prompt to the LLM to get the final answer.
* public/index.html (Frontend): This provides the user interface. It contains a form to input a question and buttons to trigger the ingest and query API calls. The JavaScript code in this file handles sending the requests to the backend and dynamically updating the UI to display the final answer, all the considered chunks with their similarity scores, and highlights the chunks that were ultimately sent to the LLM.


**How is Similarity Score Calculated?
**
The similarity score is calculated using cosine similarity. In the PostgreSQL query, this is represented by the <=> operator from the pgvector extension.
* The operator embedding <=> $1 calculates the cosine distance between the two vectors (the stored chunk embedding and the query embedding). A lower value means the vectors are closer, and therefore more similar.
* To get a score where a higher value indicates more similarity, we use the formula 1 - (embedding <=> $1). This converts the distance into a similarity score, typically ranging from 0 to 1. A score closer to 1 means the chunk is highly relevant to the query.


**Why OpenAI and Not Anthropic?
**
For this assignment, OpenAI's models were chosen primarily for their ease of integration and robust developer ecosystem, which are important for a quick, functional demonstration.
* Ease of Use: OpenAI's API is a well-established standard in the industry, and libraries like LangChain have excellent support for its models, which simplified the development process.
* Broad Versatility: While Anthropic's Claude models are highly capable, especially with long context windows and their focus on helpfulness, OpenAI's models are versatile and performant for a wide range of general-purpose tasks, including the document Q&A required by the assignment. For a demo, using a single, widely-adopted provider is the most pragmatic choice to avoid unnecessary complexity.


**How is RAG Working?
**
RAG works by combining the power of a retrieval system (our PostgreSQL database) with a generative LLM (OpenAI's GPT-4o). It ensures that the LLM's answers are grounded in specific data.
1. Ingestion: The document is loaded, chunked, and stored in a vector database as numerical embeddings.
2. Retrieval: When a query comes in, the system retrieves the most relevant chunks from the database based on vector similarity. Instead of searching the entire internet, the LLM is given a very specific, limited set of information to work with.
3. Generation: The retrieved chunks are added to a prompt as "context." The LLM then uses this context to formulate a response to the user's query, effectively augmenting its own knowledge with the specific information from the document.


**How Did You Ensure the LLM is Giving Output from the Document?
**
This is achieved through careful prompt engineering. The prompt that is sent to the LLM includes explicit instructions that constrain its behavior.
Specifically, the prompt includes these key lines:
"Use the following pieces of context to answer the question."
...
"If you don't know the answer, just say that you don't know. Do not make up an answer."
This is a powerful technique that forces the LLM to rely solely on the provided context for its response, preventing it from using its pre-trained knowledge base or hallucinating a response.


**How Can You Confirm that this LLM is Not Hallucinating?
**
While it's impossible to completely eliminate the possibility of hallucination with any LLM, the RAG approach is the best way to mitigate it. We can confirm the LLM's output by providing a clear chain of custody from the source document to the final answer.
The user interface is designed to showcase this. It displays:
1. All the chunks that were considered for the answer.
2. The similarity scores of each chunk, which show how relevant they are.
3. The highlighted chunks that were actually sent to the LLM as context.
By checking the highlighted chunks, you can manually verify that the final answer is a direct summary or synthesis of that specific information, thereby confirming that the answer is grounded in the document and not an external hallucination. This is the ultimate proof of work.

