// Rendu unique des comptes-rendus cliniques (analyse photo, consultation audio,
// fiche patient, assistant). Le texte est échappé avant la mise en forme.

const escapeHtml = (text: string) =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const inline = (text: string) =>
    text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
        .replace(/\[(S\d+)\]/g, '<span class="om-cite" title="Passage de la bibliothèque">$1</span>');

// Un titre de section : "1. CLASSIFICATION D'ANGLE :", "## Titre", "**TITRE**" ou une ligne en majuscules
const asHeading = (line: string): string | null => {
    const md = line.match(/^#{1,4}\s+(.+)$/);
    if (md) return md[1].replace(/\*\*/g, '');
    const bold = line.match(/^\*\*([^*]+)\*\*\s*:?$/);
    if (bold) return bold[1];
    const numbered = line.match(/^(\d+\.)\s+(.+?)\s*:?\s*$/);
    if (numbered) {
        const title = numbered[2].replace(/\*\*/g, '');
        const letters = title.replace(/&[a-z#0-9]+;/g, '').replace(/[^A-Za-zÀ-ÿ]/g, '');
        if (letters.length > 3 && letters === letters.toUpperCase()) return `${numbered[1]} ${title}`;
    }
    return null;
};

export const formatClinicalReport = (text: string): string => {
    if (!text) return '';
    const out: string[] = [];
    let list: 'ul' | 'ol' | null = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

    for (const raw of escapeHtml(text).split('\n')) {
        const line = raw.trim();

        if (!line) { closeList(); continue; }
        if (/^-{3,}$/.test(line)) { closeList(); out.push('<hr/>'); continue; }

        const heading = asHeading(line);
        if (heading) { closeList(); out.push(`<h4>${inline(heading)}</h4>`); continue; }

        const bullet = line.match(/^[-*•]\s+(.*)$/);
        if (bullet) {
            if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
            out.push(`<li>${inline(bullet[1])}</li>`);
            continue;
        }
        const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
        if (numbered) {
            if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
            out.push(`<li value="${numbered[1]}">${inline(numbered[2])}</li>`);
            continue;
        }

        closeList();
        if (/^⚠️/.test(line)) out.push(`<p class="om-report-alert">${inline(line.replace(/^⚠️\s*/, ''))}</p>`);
        else if (/^«.*»$/.test(line)) out.push(`<p class="om-report-quote">${inline(line)}</p>`);
        else out.push(`<p>${inline(line.replace(/^📚\s*/, ''))}</p>`);
    }
    closeList();
    return out.join('\n');
};

interface ClinicalReportProps {
    text: string;
    className?: string;
}

const ClinicalReport = ({ text, className = '' }: ClinicalReportProps) => (
    <div className={`om-report ${className}`} dangerouslySetInnerHTML={{ __html: formatClinicalReport(text) }} />
);

export default ClinicalReport;
