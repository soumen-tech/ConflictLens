# CodeGuard — Technology Stack

This document details the software development technologies, frameworks, and libraries selected to build CodeGuard.

## 1. Extension (Frontend Client)
- **Language**: TypeScript (v5.x+)
- **Framework**: VS Code Extension API
- **UI Framework**: React (v18.x+) — rendered inside the extension's Webview panel

## 2. Core Analysis Engine (Local Backend)
- **Runtime**: Node.js (v20.x+)
- **API Framework**: Express
- **Git Integration**: `simple-git`
- **AST Parsing**: `@babel/parser` & `@babel/traverse` (for JS/TS)

## 3. Security Scanning
- **Pattern Scanner**: Custom Regex-based Scanner
- **Vulnerability Detection**: Simple security rules engine

## 4. AI Explanation & Remediation Layer
- **AI Provider**: Google Gemini API (Free Tier)
- **Model**: `gemini-2.5-flash`
- **SDK**: `@google/generative-ai`

## 5. Storage
- **Session State**: In-memory / local JSON configuration files
