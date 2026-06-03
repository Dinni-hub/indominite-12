const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const targetRadioGroup = `  const RadioGroup = ({ label, options, current, setVal, number }: { label: string, options: string[], current: string, setVal: (v: string) => void, number: string }) => (
    <div className="space-y-3">
      <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">{number}. {label}</label>
      <div className="flex flex-col gap-3">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-3 cursor-pointer group">
            <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors \${current === opt ? 'border-[#3D2B1F]' : 'border-[#3D2B1F]/30 group-hover:border-[#3D2B1F]/60'}\`}>
              {current === opt && <div className="w-2.5 h-2.5 bg-[#3D2B1F] rounded-full" />}
            </div>
            <span className={\`text-sm font-semibold \${current === opt ? 'text-[#3D2B1F]' : 'text-[#3D2B1F]/70 group-hover:text-[#3D2B1F]'}\`}>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );`;

const newRadioGroup = `  const RadioGroup = ({ label, options, current, setVal, number }: { label: string, options: string[], current: string, setVal: (v: string) => void, number: string }) => (
    <div className="space-y-3">
      <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">{number}. {label}</label>
      <div className="flex flex-col gap-3">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-3 cursor-pointer group">
            <input 
              type="radio" 
              name={\`question-\${number}\`} 
              value={opt} 
              checked={current === opt} 
              onChange={() => setVal(opt)}
              className="w-5 h-5 text-[#3D2B1F] border-[#3D2B1F]/30 focus:ring-[#3D2B1F] focus:ring-offset-0 bg-white"
            />
            <span className={\`text-sm \${current === opt ? 'font-bold text-[#3D2B1F]' : 'font-medium text-[#3D2B1F]/70 group-hover:text-[#3D2B1F]'}\`}>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );`;

if(content.includes(targetRadioGroup)) {
  content = content.replace(targetRadioGroup, newRadioGroup);
  fs.writeFileSync('src/App.tsx', content);
  console.log("Updated RadioGroup");
} else {
  console.log("Target RadioGroup not found.");
}
