/**
 * @file server.ts
 * @description ConflictLens integration server — POST /analyze endpoint.
 *
 * Calls git-engine's analyzeBranches() and backend security scanners,
 * merges output into a single AnalysisResult, and returns it.
 *
 * Gemini AI stays client-side in the extension per geminiClient.ts design.
 */

import express from "express";
import cors from "cors";
import { analyzeBranches, adaptGitConflictResult } from "@codeguard/git-engine";
import { analyzeSecurityRisks, adaptSecurityRisks } from "./security/index";
import type { AnalysisResult, Risk } from "@codeguard/shared";
import simpleGit from "simple-git";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/analyze", async (req, res) => {
  const startTime = Date.now();
  try {
    const { workspacePath, branchA, branchB } = req.body;

    if (!workspacePath) {
      res.status(400).json({ error: "workspacePath is required" });
      return;
    }

    // Auto-detect branches if not provided
    const git = simpleGit({ baseDir: workspacePath });
    const effectiveBranchA = branchA || (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    const effectiveBranchB = branchB || "main";

    const allRisks: Risk[] = [];

    // 1. Run git-engine semantic/overlap analysis
    try {
      const gitResult = await analyzeBranches({
        repositoryPath: workspacePath,
        branchA: effectiveBranchA,
        branchB: effectiveBranchB,
      });
      const gitRisks = adaptGitConflictResult(gitResult);
      allRisks.push(...gitRisks);

      // 2. Run security scanner on diff content
      if (gitResult.files.length > 0) {
        // Get raw diff for security scanning
        const rawDiff = await git.diff([`${gitResult.mergeBase}...${effectiveBranchA}`]);
        if (rawDiff) {
          const securityFindings = analyzeSecurityRisks(rawDiff);
          const securityRisks = adaptSecurityRisks(securityFindings);
          allRisks.push(...securityRisks);
        }
      }
    } catch (err) {
      console.warn("[server] Analysis error:", err instanceof Error ? err.message : err);
      // Return whatever we have so far
    }

    const result: AnalysisResult = {
      analysis_id: `analysis_${Date.now()}`,
      timestamp: new Date().toISOString(),
      risks: allRisks,
    };

    res.json(result);
  } catch (err) {
    console.error("[server] Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`[ConflictLens] Integration server running on http://localhost:${PORT}`);
  console.log(`[ConflictLens] POST /analyze to start analysis`);
});
