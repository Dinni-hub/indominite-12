const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

const target = `    <ErrorBoundary>
      
           onSubmit={handleQuestionnaireSubmit}
        />
      )}

      {showExitConfirmation && (`;

const replacement = `    <ErrorBoundary>

      {showExitConfirmation && (`;

content = content.replace(target, replacement);

fs.writeFileSync('src/App.tsx', content);
