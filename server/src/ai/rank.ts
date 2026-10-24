import type { PortfolioProject, Skill } from '@runway/shared';
import { z } from 'zod';
import { UNTRUSTED_DATA_RULES, type Ai } from './client';

const Rankings = z.object({ rankings: z.array(z.object({ id: z.string(), score: z.number().min(0).max(100), reason: z.string().max(160) })).max(100) });

/** Model scores each project for the target role with a one-line reason, validated by zod. */
export async function rankProjectsWithAi(ai: Ai, projects: PortfolioProject[], role: string, skills: Skill[]) {
  const data = projects.slice(0, 40).map((p) => ({ id: p.id, name: p.name, description: p.description?.slice(0, 240) ?? null, language: p.language, tech: p.tech.slice(0, 12), stars: p.stars, pushedAt: p.pushedAt }));
  const schema = z.toJSONSchema(Rankings) as Record<string, unknown>;
  delete schema.$schema;
  const res = await ai.client.messages.create({
    model: ai.model,
    max_tokens: 2000,
    system: `You rank a student's projects by how relevant they are for a target role. Score 0-100 and give one short, concrete reason (max 15 words) per project, citing its technologies. Use only the ids given.\n\n${UNTRUSTED_DATA_RULES}`,
    tools: [{ name: 'rank_projects', description: 'Record project rankings.', input_schema: schema as { type: 'object' } }],
    tool_choice: { type: 'tool', name: 'rank_projects' },
    messages: [{ role: 'user', content: `Target role: ${role.slice(0, 80)}\n<repos>\n${JSON.stringify(data)}\n</repos>\nSkills with outside evidence: ${skills.filter((s) => s.evidence.some((e) => e !== 'resume')).map((s) => s.name).slice(0, 30).join(', ')}` }],
  });
  const call = res.content.find((b) => b.type === 'tool_use');
  if (!call || call.type !== 'tool_use') throw new Error('No ranking returned');
  return Rankings.parse(call.input).rankings;
}
