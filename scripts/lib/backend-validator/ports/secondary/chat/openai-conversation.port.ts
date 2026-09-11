/**
 * OpenAIConversationPort — Port for interacting with the OpenAI Responses API.
 *
 * This port abstracts the OpenAI Responses v5 API with function calling.
 * The adapter handles the HTTP communication; the port defines the contract.
 */

// ========== Tool Definition ========== //

/**
 * A tool (function) that the LLM can call during conversation.
 * Maps to OpenAI's function calling schema.
 */
export type ChatToolDefinition = {
  /** Unique tool name (e.g. 'check_availability'). */
  name: string;
  /** Human-readable description for the LLM. */
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: Record<string, unknown>;
  /**
   * If true, the model must confirm with the user before calling.
   * Maps to OpenAI's "strict" mode for function calling.
   */
  strict?: boolean;
};

// ========== Response Types ========== //

/**
 * A function call requested by the LLM.
 */
export type LLMFunctionCall = {
  /** The call_id from OpenAI (needed for submitting outputs). */
  callId: string;
  /** Tool name being called. */
  name: string;
  /** Parsed arguments for the tool. */
  arguments: Record<string, unknown>;
};

/**
 * Result of an OpenAI response — either a text message or function calls.
 */
export type LLMResponseResult =
  | { type: 'text'; text: string; responseId: string }
  | { type: 'function_calls'; calls: LLMFunctionCall[]; responseId: string };

/**
 * Output of a tool execution, to be sent back to OpenAI.
 */
export type ToolOutput = {
  callId: string;
  output: string; // JSON-stringified result
};

// ========== Tool Choice ========== //

export type ToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | {
      type: 'allowed_tools';
      mode: 'auto' | 'required';
      tools: Array<{ type: 'function'; name: string }>;
    };

// ========== Create Params ========== //

export type CreateConversationParams = {
  /** OpenAI API key. */
  apiKey: string;
  /** Model identifier (e.g. 'gpt-4.1'). */
  model: string;
  /** System prompt (instructions). */
  systemPrompt: string;
  /** The user's message. */
  userMessage: string;
  /**
   * Who is speaking in `userMessage`. `developer` is the orchestrator talking
   * to the model about the turn (a correction with server facts); it must not
   * be attributed to the patient.
   */
  inputRole?: 'user' | 'developer';
  /** Tools available to the model. */
  tools: ChatToolDefinition[];
  /** Previous response ID for conversation continuity (optional). */
  previousResponseId?: string | null;
  /** Controls which tools the model can call. */
  toolChoice?: ToolChoice;
  /** Whether to allow parallel tool calls. */
  parallelToolCalls?: boolean;
  /** Metadata for debugging (no sensitive data). */
  metadata?: Record<string, string>;
  /** Whether to store the response on OpenAI's servers for debugging. */
  store?: boolean;
  /** Reasoning effort for the model. */
  reasoning?: { effort: 'low' | 'medium' | 'high' };
  /** Text generation settings. */
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
    format?: {
      type: 'json_schema';
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };
  /** Prompt cache key for cost optimization. */
  promptCacheKey?: string;
};

// ========== Continue Params ========== //

export type ContinueConversationParams = {
  /** OpenAI API key. */
  apiKey: string;
  /** Model identifier. */
  model: string;
  /** The response ID of the previous response that made function calls. */
  previousResponseId: string;
  /** Tool outputs to submit. */
  toolOutputs: ToolOutput[];
  /** Tools available (same as initial call). */
  tools: ChatToolDefinition[];
  /** Controls which tools the model can call. */
  toolChoice?: ToolChoice;
  /** Whether to allow parallel tool calls. */
  parallelToolCalls?: boolean;
  /** Metadata for debugging (no sensitive data). */
  metadata?: Record<string, string>;
  /** Whether to store the response on OpenAI's servers for debugging. */
  store?: boolean;
  /** Reasoning effort for the model. */
  reasoning?: { effort: 'low' | 'medium' | 'high' };
  /** Text generation settings. */
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
    format?: {
      type: 'json_schema';
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };
  /** Prompt cache key for cost optimization. */
  promptCacheKey?: string;
};

// ========== Port Interface ========== //

export interface OpenAIConversationPort {
  /**
   * Start a new conversation turn (or continue from previousResponseId).
   * Returns either a final text response or function calls to execute.
   */
  createResponse(params: CreateConversationParams): Promise<LLMResponseResult>;

  /**
   * Continue a conversation by submitting tool outputs after function calls.
   * Returns either a final text response or MORE function calls.
   */
  continueWithToolOutputs(params: ContinueConversationParams): Promise<LLMResponseResult>;
}
