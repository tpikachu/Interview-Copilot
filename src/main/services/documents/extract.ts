import { readFile } from 'fs/promises';
import { extname } from 'path';

/** Extract raw text from a local file. All extraction happens locally; only the
 *  resulting text is later sent to OpenAI for structured parsing. */
export async function extractText(filePath: string): Promise<{ text: string; mime: string }> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md': {
      const text = await readFile(filePath, 'utf8');
      return { text, mime: ext === '.md' ? 'text/markdown' : 'text/plain' };
    }
    case '.pdf': {
      // pdf-parse is CJS; import lazily to keep startup light.
      const pdfParse = (await import('pdf-parse')).default;
      const buf = await readFile(filePath);
      const data = await pdfParse(buf);
      return { text: data.text, mime: 'application/pdf' };
    }
    case '.docx': {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ path: filePath });
      return {
        text: value,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    default:
      throw new Error(`Unsupported file type: ${ext || '(none)'}`);
  }
}
