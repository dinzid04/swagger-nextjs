// app/layout.js
// https://nextjs.org/docs/app/getting-started/installation
import "./globals.css";

export const metadata = {
  title: "Comming Soon!",
  description: "Comming Soon!",
}

import Header from './components/Header';
import Footer from './components/Footer';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen bg-gray-50">
        <Header />
        <main className="flex-grow container mx-auto p-4">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}