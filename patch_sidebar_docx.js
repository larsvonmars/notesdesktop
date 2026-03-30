const fs = require('fs');

let content = fs.readFileSync('components/NoteDetailsSidebar.tsx', 'utf8');

// Add props
content = content.replace(
  'onExportPdf?: () => void',
  'onExportPdf?: () => void\n  onExportDocx?: () => void\n  onImportDocx?: () => void'
);
content = content.replace(
  'onExportPdf,',
  'onExportPdf,\n  onExportDocx,\n  onImportDocx,'
);

// Add mini sidebar buttons
content = content.replace(
  '{(onExportMarkdown || onExportPdf) && (',
  '{(onExportMarkdown || onExportPdf || onExportDocx || onImportDocx) && ('
);
content = content.replace(
  '{(onExportMarkdown || onExportPdf) && (', // Do it for the main sidebar as well
  '{(onExportMarkdown || onExportPdf || onExportDocx || onImportDocx) && ('
);

// ... Let's use edit tool instead
