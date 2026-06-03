const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Remove QuestionnaireModal component (from line 868 to 963 approximately)
const modalMatch = content.match(/function QuestionnaireModal\([^]*?\}\s*export default function App\(\) \{/);
if (modalMatch) {
  content = content.replace(modalMatch[0], 'export default function App() {');
}

// 2. Remove states related to questionnaire in App component
content = content.replace(/const \[showQuestionnaire\, setShowQuestionnaire\] = useState\(false\);\n/g, "");

const qSubmitFuncMatch = content.match(/const handleQuestionnaireSubmit = async \([^]*?\}\s*};\n/);
if (qSubmitFuncMatch) {
  content = content.replace(qSubmitFuncMatch[0], "");
}

// 3. Update the Profile Subviews list
const oldProfileList = `                    { name: "Alamat Pengantaran", icon: <Box size={20} /> },
                    { name: "Pusat Bantuan", icon: <HelpCircle size={20} /> },`;
const newProfileList = `                    { name: "Alamat Pengantaran", icon: <Box size={20} /> },
                    { name: "Kuesioner", icon: <Star size={20} /> },
                    { name: "Pusat Bantuan", icon: <HelpCircle size={20} /> },`;

content = content.replace(oldProfileList, newProfileList);

// Remove showQuestionnaire modal usage
const modalUsageMatch = content.match(/\{\s*showQuestionnaire && \([^]*?\)\s*\}/);
if (modalUsageMatch) {
  content = content.replace(modalUsageMatch[0], "");
}

// Remove floating button usage
// It's the only one checking \`view === "home" && userRole !== "owner"\` before \`</ErrorBoundary>\`
// We'll search and remove it specifically.
const floatingBtnRegex = /\{\s*view === \"home\" && userRole !== \"owner\" && \(\s*<div className=\"fixed bottom-24 right-4 sm:right-8 z-40\">\s*<button\s*onClick=\{\(\) => setShowQuestionnaire\(true\)\}[^]*?<\/div>\s*\)\s*\}/;
content = content.replace(floatingBtnRegex, "");

// 4. Add the Kuesioner profileSubView code
// We'll define a standalone sub-view inside 'profileSubView' logic
const kuesionerSubviewCode = `                {profileSubView === "Kuesioner" && (
                  <div className="space-y-6 pb-36">
                    <div className="bg-white p-6 rounded-3xl border border-[#3D2B1F]/5 shadow-sm">
                      <div className="space-y-4">
                        <KuesionerForm
                           onSubmit={async (data) => {
                             showNotification("Terima kasih, masukan Anda sangat berarti!");
                             if (isFirebaseConfigured) {
                               try {
                                 await addDoc(collection(db, "app_feedback"), {
                                    type: "Kuesioner",
                                    comment: JSON.stringify(data),
                                    rating: 5,
                                    timestamp: serverTimestamp(),
                                    userEmail: currentUser?.email || customerEmail || "anon"
                                 });
                               } catch(e) {
                                 console.warn("Failed to save Kuesioner", e);
                               }
                             }
                             setProfileSubView(null);
                           }}
                        />
                      </div>
                    </div>
                  </div>
                )}
`;

// Insert it after `profileSubView === "Alamat Pengantaran"`
const alamatEndIndex = content.indexOf(`{profileSubView === "Pusat Bantuan" && (`);
if (alamatEndIndex !== -1) {
  content = content.slice(0, alamatEndIndex) + kuesionerSubviewCode + content.slice(alamatEndIndex);
}

// 5. Add KuesionerForm outside of App() component
const kuesionerFormDef = `
function KuesionerForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [q4, setQ4] = useState("");
  const [q5, setQ5] = useState("");
  const [q6, setQ6] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ q1, q2, q3, q4, q5, q6 });
  };

  const RadioGroup = ({ label, options, current, setVal, number }: { label: string, options: string[], current: string, setVal: (v: string) => void, number: string }) => (
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
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <p className="text-sm font-bold text-[#3D2B1F]/70 mb-4">Bantu Indomi Nite Jadi Lebih Baik!</p>
      
      <RadioGroup 
        number="1"
        label="Seberapa mudah Anda menemukan menu yang diinginkan di dalam aplikasi?"
        options={["Sangat Sulit", "Sulit", "Cukup Mudah", "Sangat Mudah"]}
        current={q1} setVal={setQ1}
      />
      
      <RadioGroup 
        number="2"
        label="Bagaimana penilaian Anda terhadap tampilan (layout) dan desain aplikasi?"
        options={["Sangat Tidak Menarik", "Kurang Menarik", "Cukup Menarik", "Sangat Menarik"]}
        current={q2} setVal={setQ2}
      />
      
      <RadioGroup 
        number="3"
        label="Bagaimana penilaian Anda terhadap kejelasan informasi harga yang tertera di aplikasi?"
        options={["Sangat Tidak Jelas", "Kurang Jelas", "Cukup Jelas", "Sangat Jelas"]}
        current={q3} setVal={setQ3}
      />

      <RadioGroup 
        number="4"
        label="Seberapa sering Anda mengalami kendala teknis (seperti error atau lag) saat menggunakan aplikasi?"
        options={["Selalu", "Sering", "Jarang", "Tidak Pernah"]}
        current={q4} setVal={setQ4}
      />

      <RadioGroup 
        number="5"
        label="Bagaimana penilaian Anda terhadap alur pemesanan (dari pilih menu hingga selesai) di aplikasi ini?"
        options={["Sangat Berbelit-belit", "Cukup Membingungkan", "Cukup Ringkas/Jelas", "Sangat Praktis dan Cepat"]}
        current={q5} setVal={setQ5}
      />

      <div className="space-y-3">
        <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">6. Apa saran atau masukan tambahan Anda agar aplikasi INDOMI NITE menjadi lebih baik ke depannya?</label>
        <textarea
          className="w-full bg-[#F5F2EA] border-none text-[#3D2B1F] placeholder-[#3D2B1F]/40 p-4 rounded-2xl resize-none h-32 focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/20 text-sm font-medium shadow-inner"
          placeholder="Ketik saran Anda di sini..."
          value={q6}
          onChange={e => setQ6(e.target.value)}
        ></textarea>
      </div>
      
      <button
        type="submit"
        className="w-full py-4 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-800 transition-colors"
        disabled={!q1 || !q2 || !q3 || !q4 || !q5}
      >
         Kirim Kuesioner
      </button>
    </form>
  );
}

export default function App() {`;

content = content.replace("export default function App() {", kuesionerFormDef);

fs.writeFileSync('src/App.tsx', content);
