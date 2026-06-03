const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const targetArray = `{[
                    { name: "Pengaturan Akun", icon: <Settings size={20} /> },
                    {
                      name: "Metode Pembayaran",
                      icon: <CreditCard size={20} />,
                    },
                    { name: "Alamat Pengantaran", icon: <Box size={20} /> },
                    { name: "Kuesioner", icon: <Star size={20} /> },
                    { name: "Pusat Bantuan", icon: <HelpCircle size={20} /> },`;

const replacementArray = `{[
                    { name: "Pengaturan Akun", icon: <Settings size={20} /> },
                    { name: "Alamat Pengantaran", icon: <Box size={20} /> },
                    { name: "Kuesioner", icon: <Star size={20} /> },
                    {
                      name: "Metode Pembayaran",
                      icon: <CreditCard size={20} />,
                    },
                    { name: "Pusat Bantuan", icon: <HelpCircle size={20} /> },`;

content = content.replace(targetArray, replacementArray);

fs.writeFileSync('src/App.tsx', content);
