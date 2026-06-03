const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const kuesionerComponent = `
function QuestionnaireModal({ onClose, onSubmit }: { onClose: () => void, onSubmit: (data: any) => void }) {
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

  const OptionBtn = ({ val, current, setVal }: any) => (
    <button
      type="button"
      onClick={() => setVal(val)}
      className={\`flex-1 py-3 px-2 text-[10px] leading-tight font-bold rounded-xl border transition-all \${current === val ? "bg-[#3D2B1F] text-white border-[#3D2B1F] shadow-md" : "bg-white text-[#3D2B1F]/60 border-[#3D2B1F]/10 hover:border-[#3D2B1F]/30"}\`}
    >
      {val}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-white rounded-[2rem] p-6 shadow-2xl w-full max-w-lg my-8 relative overflow-hidden"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-[#3D2B1F] leading-tight pr-4">Bantu Indomi Nite Jadi Lebih Baik!</h3>
          <button onClick={onClose} className="h-8 w-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-200 shrink-0">
            <X size={16} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">1. Seberapa mudah Anda menemukan menu yang diinginkan di dalam aplikasi?</label>
            <div className="flex gap-2">
              {["Sangat Sulit", "Sulit", "Cukup Mudah", "Sangat Mudah"].map(v => <OptionBtn key={v} val={v} current={q1} setVal={setQ1} />)}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">2. Bagaimana penilaian Anda terhadap tampilan (layout) dan desain aplikasi?</label>
            <div className="flex gap-2">
              {["Sangat Tidak Menarik", "Kurang Menarik", "Cukup Menarik", "Sangat Menarik"].map(v => <OptionBtn key={v} val={v} current={q2} setVal={setQ2} />)}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">3. Bagaimana penilaian Anda terhadap kejelasan informasi harga yang tertera di aplikasi?</label>
            <div className="flex gap-2">
              {["Sangat Tidak Jelas", "Kurang Jelas", "Cukup Jelas", "Sangat Jelas"].map(v => <OptionBtn key={v} val={v} current={q3} setVal={setQ3} />)}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">4. Seberapa sering Anda mengalami kendala teknis (seperti error atau lag) saat menggunakan aplikasi?</label>
            <div className="flex gap-2">
              {["Selalu", "Sering", "Jarang", "Tidak Pernah"].map(v => <OptionBtn key={v} val={v} current={q4} setVal={setQ4} />)}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">5. Bagaimana penilaian Anda terhadap alur pemesanan (dari pilih menu hingga selesai) di aplikasi ini?</label>
            <div className="flex gap-2 flex-wrap">
              {["Sangat Berbelit-belit", "Cukup Membingungkan", "Cukup Ringkas/Jelas", "Sangat Praktis dan Cepat"].map(v => (
                 <div key={v} className="w-[48%]">
                    <OptionBtn val={v} current={q5} setVal={setQ5} />
                 </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">6. Apa saran atau masukan tambahan Anda agar aplikasi INDOMI NITE menjadi lebih baik ke depannya</label>
            <textarea
              className="w-full bg-[#3D2B1F]/5 text-[#3D2B1F] placeholder-[#3D2B1F]/30 p-4 rounded-2xl resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/20 text-sm"
              placeholder="Ketik saran Anda di sini..."
              value={q6}
              onChange={e => setQ6(e.target.value)}
            ></textarea>
          </div>
          
          <button
            type="submit"
            className="w-full py-4 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!q1 || !q2 || !q3 || !q4 || !q5}
          >
             Kirim Kuesioner
          </button>
        </form>
      </motion.div>
    </div>
  );
}
`;

// Insert the component before export default function App
content = content.replace("export default function App() {", kuesionerComponent + "\nexport default function App() {\n  const [showQuestionnaire, setShowQuestionnaire] = useState(false);\n");

// Add handleQuestionnaireSubmit in App
const handleQuestionnaireSubmit = `
  const handleQuestionnaireSubmit = async (data: any) => {
    setShowQuestionnaire(false);
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
  };
`;

// Find where to insert handleQuestionnaireSubmit
content = content.replace("  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);", "  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);\n" + handleQuestionnaireSubmit);

const renderModalCode = `
      {showExitConfirmation && (
`;
content = content.replace(renderModalCode, `
      {showQuestionnaire && (
        <QuestionnaireModal 
           onClose={() => setShowQuestionnaire(false)}
           onSubmit={handleQuestionnaireSubmit}
        />
      )}
` + renderModalCode);

// Inject floating button right before ErrorBoundary closes.
const floatingBtnCode = `
      {view === "home" && userRole !== "owner" && (
        <div className="fixed bottom-24 right-4 sm:right-8 z-40">
           <button
             onClick={() => setShowQuestionnaire(true)}
             className="bg-[#D4AF37] text-white p-3 rounded-full shadow-2xl flex items-center gap-2 hover:scale-105 transition-transform"
           >
             <div className="h-6 w-6 relative overflow-hidden bg-white/20 rounded-full border border-white/40 flex justify-center items-center shrink-0">
               <Star size={12} className="fill-white" />
             </div>
             <span className="text-xs font-bold whitespace-nowrap pr-2">Isi Kuesioner</span>
           </button>
        </div>
      )}
`;

content = content.replace("    </ErrorBoundary>", floatingBtnCode + "\n    </ErrorBoundary>");

fs.writeFileSync('src/App.tsx', content);
console.log("Done");
