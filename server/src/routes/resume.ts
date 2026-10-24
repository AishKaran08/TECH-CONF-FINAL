import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ResumeError } from '../resume/extract';
import type { Services } from '../services';

export function resumeRoutes(s: Services): Hono {
  const r = new Hono();
  r.post('/resume', async (c) => {
    if (!s.resume) throw new HTTPException(503, { message: 'Resume upload is not available.' });
    if (s.ws.mode() === 'demo') throw new HTTPException(400, { message: 'Turn off Demo data to upload your own resume.' });
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > 6 * 1024 * 1024) throw new HTTPException(413, { message: 'That file is larger than 5 MB.' });
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) throw new HTTPException(400, { message: 'Choose a resume file to upload.' });
    try {
      const res = await s.resume.ingest(file.name, new Uint8Array(await file.arrayBuffer()));
      return c.json({ unchanged: res.unchanged, parsedBy: res.parsedBy, fileName: res.record.fileName });
    } catch (err) {
      if (err instanceof ResumeError) throw new HTTPException(400, { message: err.message });
      throw err;
    }
  });
  return r;
}
