import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { cwd } from 'process';

/**
 * Load a prompt file from src/prompts (preferred for local development)
 * or dist/prompts (fallback for production builds)
 * @param filename - Name of the prompt file (e.g., 'atc-agent-prompt.txt')
 * @returns The contents of the prompt file as a string
 */
export function loadPrompt(filename: string): string {
  const srcPath = join(cwd(), 'src/prompts', filename);
  const distPath = join(cwd(), 'dist/prompts', filename);
  
  // Prefer src/prompts for local development, fall back to dist/prompts for production builds
  if (existsSync(srcPath)) {
    return readFileSync(srcPath, 'utf-8');
  }
  return readFileSync(distPath, 'utf-8');
}

