# AI Assistant Guide

## Overview

Notes Desktop now includes an integrated AI Assistant powered by DeepSeek. The AI assistant lives in the UnifiedPanel (access with `⌘\` or `Ctrl+\`) in a new **AI** tab.

## Features

### Chat Interface
- Natural language conversation with the AI
- Context-aware responses based on your current note, tasks, and calendar
- Streaming responses for real-time feedback
- Message history within the session

### Quick Actions

#### For Text Notes:
- **Summarize** - Get a concise summary with key points
- **Improve** - Enhance writing quality and clarity
- **Fix Grammar** - Correct spelling, grammar, and punctuation
- **Concise** - Make text more concise while preserving meaning

#### For Productivity:
- **Suggest Tasks** - AI suggests relevant tasks based on your note content
- **Suggest Events** - AI recommends calendar events to schedule

#### For Mind Maps:
- **Mindmap Ideas** - Generate related node ideas for expansion

### Context Awareness

The AI assistant automatically has access to:
- **Current Note** - Title, content, and type (text/drawing/mindmap)
- **Tasks** - Your pending and recent tasks with priorities and due dates
- **Calendar Events** - Upcoming events for the next 7 days
- **Mindmap State** - Selected node in mindmap mode

## Setup

### Configuring the DeepSeek API Key

1. Open the UnifiedPanel (`⌘\` or `Ctrl+\`)
2. Click the **AI** tab
3. Click the **Settings** icon (gear) in the input area
4. Enter your DeepSeek API key
5. Click **Save API Key**

You can get an API key from [DeepSeek Platform](https://platform.deepseek.com/api_keys).

## Usage Examples

### Summarizing Notes
1. Open a note you want to summarize
2. Go to AI tab → Click "Summarize"
3. View the summary with key points and suggested tasks

### Getting Writing Help
1. Select some text in your note (or use the entire note)
2. Go to AI tab → Click "Improve" or "Fix Grammar"
3. Review the AI's suggestions in the chat

### Expanding Mind Maps
1. Open a mindmap note
2. Select a node you want to expand
3. Go to AI tab → Click "Mindmap Ideas"
4. Click "Add" on any suggestion to add it as a child node

### Task Suggestions
1. Open a note with action items or meeting notes
2. Go to AI tab → Click "Suggest Tasks"
3. Review suggestions and click "Add" to create tasks

### Custom Queries
Simply type any question in the chat input:
- "What are the main themes in this note?"
- "Help me rewrite the introduction paragraph"
- "What tasks should I prioritize this week?"
- "Suggest some follow-up ideas for this topic"

## Technical Details

### API
- **Provider**: DeepSeek
- **Model**: deepseek-chat
- **Streaming**: Supported for real-time responses

### Files
- `lib/ai.ts` - AI API client and helper functions
- `components/AIAssistant.tsx` - Main AI component
- `components/UnifiedPanel.tsx` - Integration point

### Data Flow
1. User interacts with AI Assistant in UnifiedPanel
2. Context is gathered from current note, tasks, and events
3. Request is sent to DeepSeek API
4. Response is streamed back and displayed
5. Actions (insert text, create task, add node) are executed via callbacks

## Privacy & Security

- API key is stored locally in memory (not persisted)
- Note content is sent to DeepSeek for processing
- No data is stored on external servers beyond API request processing

## Limitations

- Requires active internet connection
- API key must be configured before use
- Drawing notes cannot be analyzed (only text and mindmap)
- Large notes may be truncated to fit API limits
