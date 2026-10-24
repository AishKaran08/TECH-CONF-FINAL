import { ResumeProfile } from '@runway/shared';
import { z } from 'zod';
import { UNTRUSTED_DATA_RULES, type Ai } from './client';

const TOOL_NAME = 'record_profile';

function toolSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ResumeProfile, { io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/**
 * Extract a structured profile from resume text with a forced tool call. The tool input is
 * validated with zod; anything that does not match throws, and the caller falls back to the
 * heuristic parser.
 */
export async function extractProfileWithAi(ai: Ai, text: string): Promise<ResumeProfile> {
  const res = await ai.client.messages.create({
    model: ai.model,
    max_tokens: 4000,
    system: `You extract structured data from a student's resume for a personal dashboard. Copy facts as written; do not invent anything. Skills: concrete technologies, languages, tools and CS subjects only. Projects and experience: keep each bullet's wording, shortened only if very long. Links: full URLs.\n\n${UNTRUSTED_DATA_RULES}`,
    tools: [{ name: TOOL_NAME, description: 'Record the structured resume profile.', input_schema: toolSchema() as { type: 'object' } }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: `<resume>\n${text}\n</resume>\n\nRecord the profile with the ${TOOL_NAME} tool.` }],
  });
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  if (!call || call.type !== 'tool_use') throw new Error('The model did not return a profile.');
  const parsed = ResumeProfile.safeParse(call.input);
  if (!parsed.success) throw new Error('The model returned a profile in the wrong shape.');
  // Trim to sane sizes.
  const p = parsed.data;
  return {
    ...p,
    skills: [...new Set(p.skills.map((s) => s.trim()).filter((s) => s && s.length <= 40))].slice(0, 80),
    projects: p.projects.slice(0, 30),
    experience: p.experience.slice(0, 20),
    links: p.links.filter((l) => /^https?:\/\//.test(l)).slice(0, 15),
  };
}
