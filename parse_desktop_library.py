import os
import json
import uuid
import time
from pypdf import PdfReader

LIBRARY_DIR = "/Users/robinmasini/Desktop/bibliothèque OrthoMind"
OUTPUT_FILE = "/Users/robinmasini/Desktop/Casper Dental/public/casper_knowledge.json"

def clean_text(text):
    if not text:
        return ""
    # Standard normalization of spaces
    return " ".join(text.split()).strip()

def chunk_text(text, page_number, chunk_size=1000, chunk_overlap=200):
    chunks = []
    if not text:
        return chunks
        
    start = 0
    chunk_index = 0
    text_len = len(text)
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        content = text[start:end]
        
        # Align with word boundary
        if end < text_len:
            last_space = content.rfind(" ")
            if last_space > chunk_size * 0.8:
                content = content[:last_space]
                
        chunks.append({
            "content": content.strip(),
            "page_number": page_number,
            "chunk_index": chunk_index
        })
        chunk_index += 1
        
        start += len(content) - chunk_overlap
        if start >= text_len or len(content) <= chunk_overlap:
            break
            
    return chunks

def process_pdfs():
    print(f"Starting ingestion from library: {LIBRARY_DIR}")
    
    books = []
    all_chunks = []
    
    # Recursively find all PDF files
    pdf_files = []
    for root, dirs, files in os.walk(LIBRARY_DIR):
        for file in files:
            if file.lower().endswith('.pdf'):
                pdf_files.append(os.path.join(root, file))
                
    total_files = len(pdf_files)
    print(f"Found {total_files} PDF files to ingest.")
    
    for idx, pdf_path in enumerate(pdf_files, 1):
        file_name = os.path.basename(pdf_path)
        title = file_name.replace(".pdf", "")
        file_size = os.path.getsize(pdf_path)
        book_id = f"local-book-{uuid.uuid4().hex[:12]}"
        
        print(f"[{idx}/{total_files}] Processing: {file_name} ({(file_size/(1024*1024)):.2f} MB)...")
        
        start_time = time.time()
        try:
            reader = PdfReader(pdf_path)
            total_pages = len(reader.pages)
            
            book_chunks_count = 0
            for page_idx, page in enumerate(reader.pages, 1):
                try:
                    text = page.extract_text()
                    cleaned = clean_text(text)
                    if not cleaned:
                        continue
                        
                    page_chunks = chunk_text(cleaned, page_idx)
                    for chunk in page_chunks:
                        all_chunks.append({
                            "id": f"local-chunk-{uuid.uuid4().hex[:12]}",
                            "document_id": book_id,
                            "book_title": title,
                            "content": chunk["content"],
                            "page_number": chunk["page_number"],
                            "chunk_index": chunk["chunk_index"]
                        })
                        book_chunks_count += 1
                except Exception as page_err:
                    print(f"  Warning: Error parsing page {page_idx} of {file_name}: {str(page_err)}")
            
            books.append({
                "id": book_id,
                "title": title,
                "file_name": file_name,
                "file_size": file_size,
                "total_pages": total_pages,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "chunks_count": book_chunks_count,
                "is_local": True
            })
            
            elapsed = time.time() - start_time
            print(f"  Finished: {total_pages} pages, {book_chunks_count} chunks created in {elapsed:.2f}s.")
            
        except Exception as e:
            print(f"  Error processing {file_name}: {str(e)}")
            
    # Save to file
    output_data = {
        "books": books,
        "chunks": all_chunks
    }
    
    print(f"Saving compiled data to: {OUTPUT_FILE}")
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print("Ingestion success!")
    print(f"Total Books: {len(books)}")
    print(f"Total Chunks: {len(all_chunks)}")

if __name__ == "__main__":
    process_pdfs()
