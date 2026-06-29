// Helper service to parse PDF files entirely in the client browser using PDF.js

export interface ParsedPage {
    pageNumber: number;
    text: string;
}

export const loadPdfJS = (): Promise<any> => {
    return new Promise((resolve, reject) => {
        // If already loaded, return it
        if ((window as any).pdfjsLib) {
            resolve((window as any).pdfjsLib);
            return;
        }

        // Create script tag
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        script.onload = () => {
            const pdfjsLib = (window as any).pdfjsLib;
            // Set worker source
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
            resolve(pdfjsLib);
        };
        script.onerror = (err) => {
            reject(new Error('Failed to load PDF.js from CDN: ' + err));
        };
        document.head.appendChild(script);
    });
};

export const extractTextFromPdf = async (
    file: File,
    onProgress?: (current: number, total: number) => void
): Promise<ParsedPage[]> => {
    const pdfjsLib = await loadPdfJS();
    
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const parsedPages: ParsedPage[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Join text items
            const text = textContent.items
                .map((item: any) => item.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
                
            parsedPages.push({
                pageNumber: pageNum,
                text: text
            });

            if (onProgress) {
                onProgress(pageNum, totalPages);
            }
        } catch (error) {
            console.error(`Error parsing page ${pageNum} from PDF:`, error);
            // Push empty text for this page to keep indexes consistent
            parsedPages.push({
                pageNumber: pageNum,
                text: ''
            });
        }
    }

    return parsedPages;
};

// Simple utility to chunk text into manageable segments (RAG chunks)
export interface TextChunk {
    content: string;
    pageNumber: number;
    chunkIndex: number;
}

export const chunkParsedPages = (pages: ParsedPage[], chunkSize: number = 1000, chunkOverlap: number = 200): TextChunk[] => {
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;

    for (const page of pages) {
        if (!page.text) continue;

        const text = page.text;
        let start = 0;

        while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);
            let content = text.substring(start, end);

            // Try to align with word boundary if not at end of text
            if (end < text.length) {
                const lastSpace = content.lastIndexOf(' ');
                if (lastSpace > chunkSize * 0.8) {
                    content = content.substring(0, lastSpace);
                }
            }

            chunks.push({
                content: content.trim(),
                pageNumber: page.pageNumber,
                chunkIndex: chunkIndex++
            });

            start += content.length - chunkOverlap;
            if (start >= text.length || content.length <= chunkOverlap) {
                break;
            }
        }
    }

    return chunks;
};
