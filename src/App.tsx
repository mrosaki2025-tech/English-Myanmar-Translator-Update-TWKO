import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, Square, Loader2, Copy, Trash2, CheckCircle2, 
  AlertCircle, Upload, Download, Languages, ArrowRightLeft, 
  MessageSquare, Settings, Sparkles, Volume2, PlayCircle, Speaker 
} from 'lucide-react';
import { transcribeAudio, translateText, textToSpeech } from './lib/gemini';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

type Tab = 'transcribe' | 'translate' | 'tts';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('transcribe');
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastAudioBase64, setLastAudioBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transDirection, setTransDirection] = useState<'en-my' | 'my-en'>('en-my');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = window.setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setTimer(0);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscription(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError('မိုက်ကရိုဖုန်းကို အသုံးပြုခွင့်မရပါ။ ကျေးဇူးပြု၍ ခွင့်ပြုချက်ပေးပါ။');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (blob: Blob) => {
    setIsProcessing(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const result = await transcribeAudio(base64Audio, 'audio/webm');
        setOutputText((prev) => (prev ? prev + '\n' + result : result));
        setIsProcessing(false);
      };
    } catch (err) {
      setError('စာသားပြောင်းလဲခြင်း မအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပေးပါ။');
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('ကျေးဇူးပြု၍ အသံဖိုင် (Audio file) သာ တင်ပေးပါ။');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const result = await transcribeAudio(base64Audio, file.type);
        setOutputText((prev) => (prev ? prev + '\n' + result : result));
        setIsProcessing(false);
      };
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError('ဖိုင်မှ စာသားပြောင်းလဲခြင်း မအောင်မြင်ပါ။');
      setIsProcessing(false);
    }
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await translateText(inputText, transDirection);
      setOutputText(result);
    } catch (err) {
      setError('ဘာသာပြန်ဆိုခြင်း မအောင်မြင်ပါ။');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTTS = async (customText?: string) => {
    const textToConvert = customText || inputText || outputText;
    if (!textToConvert.trim()) return;

    setIsProcessing(true);
    setError(null);
    setIsPlaying(true);
    try {
      const base64Audio = await textToSpeech(textToConvert);
      setLastAudioBase64(base64Audio);
      
      // Decode base64 to array buffer
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS usually returns raw PCM 16-bit 24kHz
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
      const channelData = audioBuffer.getChannelData(0);

      // Convert 8-bit bytes to 16-bit PCM floats
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < audioBuffer.length; i++) {
        // Int16 is 2 bytes
        const sample = view.getInt16(i * 2, true); // true for little-endian
        channelData[i] = sample / 32768; // Normalize to -1 to 1
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (err) {
      setError('အသံထွက်ဖတ်ခြင်း မအောင်မြင်ပါ။');
      setIsPlaying(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAudio = () => {
    if (!lastAudioBase64) return;

    // Decode base64 to array buffer
    const binaryString = atob(lastAudioBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Wrap PCM in WAV header
    const samples = new Int16Array(bytes.buffer);
    const wavBlob = encodeWAV(samples, 24000);
    saveAs(wavBlob, "speech.wav");
  };

  const encodeWAV = (samples: Int16Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk size */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* WAVE identifier */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk size */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count (mono) */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk size */
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, samples[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  const exportToWord = async () => {
    const content = activeTab === 'transcribe' ? outputText : outputText || inputText;
    if (!content) return;
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: "Generated Document", bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun({ text: "\n" + content, size: 24 })] }),
        ],
      }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, "transcript_translation.docx");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#1C1E21] font-sans selection:bg-[#2D88FF]/30 p-0 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6 h-screen md:h-[90vh]">
        
        {/* Sidebar Navigation - Desktop */}
        <aside className="hidden md:flex flex-col w-64 bg-white rounded-3xl p-6 shadow-sm border border-black/5">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 bg-[#2D88FF] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#2D88FF]/20">
              <Sparkles size={24} />
            </div>
            <span className="font-bold text-lg tracking-tight">Burmese AI</span>
          </div>
          
          <nav className="space-y-2 flex-grow">
            <button 
              onClick={() => setActiveTab('transcribe')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'transcribe' ? 'bg-[#2D88FF] text-white shadow-md shadow-[#2D88FF]/20' : 'hover:bg-[#F0F2F5] text-[#65676B]'}`}
            >
              <Mic size={20} />
              <span className="font-semibold">အသံမှစာသား</span>
            </button>
            <button 
              onClick={() => setActiveTab('translate')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'translate' ? 'bg-[#2D88FF] text-white shadow-md shadow-[#2D88FF]/20' : 'hover:bg-[#F0F2F5] text-[#65676B]'}`}
            >
              <Languages size={20} />
              <span className="font-semibold">ဘာသာပြန်</span>
            </button>
            <button 
              onClick={() => setActiveTab('tts')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'tts' ? 'bg-[#2D88FF] text-white shadow-md shadow-[#2D88FF]/20' : 'hover:bg-[#F0F2F5] text-[#65676B]'}`}
            >
              <Volume2 size={20} />
              <span className="font-semibold">စာသားမှအသံ</span>
            </button>
          </nav>
          
          <div className="pt-6 border-t border-black/5">
             <p className="text-[10px] text-[#65676B] px-2 font-bold uppercase tracking-widest opacity-50">Powered by Gemini AI</p>
          </div>
        </aside>

        {/* Mobile Navigation */}
        <div className="md:hidden flex bg-white p-2 gap-2 shadow-sm sticky top-0 z-50">
          <button 
            onClick={() => setActiveTab('transcribe')}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === 'transcribe' ? 'bg-[#2D88FF] text-white' : 'text-[#65676B]'}`}
          >
            <Mic size={18} />
            <span className="text-sm font-bold">Transcribe</span>
          </button>
          <button 
            onClick={() => setActiveTab('translate')}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === 'translate' ? 'bg-[#2D88FF] text-white' : 'text-[#65676B]'}`}
          >
            <Languages size={18} />
            <span className="text-sm font-bold">Translate</span>
          </button>
          <button 
            onClick={() => setActiveTab('tts')}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === 'tts' ? 'bg-[#2D88FF] text-white' : 'text-[#65676B]'}`}
          >
            <Volume2 size={18} />
            <span className="text-sm font-bold">TTS</span>
          </button>
        </div>

        {/* Main Content Area */}
        <main className="flex-grow flex flex-col gap-4 overflow-hidden">
          
          {/* Header Mobile Only */}
          <div className="md:hidden px-4 pt-4">
             <h1 className="text-2xl font-bold font-serif">မြန်မာစကားမှ စာသားသို့</h1>
          </div>

          <div className="flex-grow overflow-y-auto px-4 md:px-0 pb-20 md:pb-0 space-y-4">
            
            {activeTab === 'transcribe' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2rem] p-8 md:p-12 shadow-sm border border-black/5 flex flex-col items-center justify-center min-h-[350px] relative overflow-hidden"
              >
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#2D88FF]/5 blur-[100px] -mr-32 -mt-32 rounded-full" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 blur-[100px] -ml-32 -mb-32 rounded-full" />

                <div className="relative z-10 flex flex-col items-center gap-8 w-full">
                  <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
                    {/* Record Button */}
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative group">
                        <AnimatePresence>
                          {isRecording && (
                            <motion.div
                              initial={{ scale: 1, opacity: 0.5 }}
                              animate={{ scale: 2, opacity: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                              className="absolute inset-0 bg-[#2D88FF]/40 rounded-full"
                            />
                          )}
                        </AnimatePresence>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={isRecording ? stopRecording : startRecording}
                          disabled={isProcessing}
                          className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all shadow-xl relative z-20 ${
                            isRecording 
                              ? 'bg-red-500 text-white shadow-red-500/30' 
                              : isProcessing 
                                ? 'bg-gray-100 text-gray-300'
                                : 'bg-[#2D88FF] text-white shadow-[#2D88FF]/20 hover:shadow-[#2D88FF]/40'
                          }`}
                        >
                          {isRecording ? <Square size={36} fill="currentColor" /> : <Mic size={36} />}
                        </motion.button>
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[#65676B]">Record Voice</span>
                    </div>

                    <div className="hidden md:block w-px h-16 bg-black/5" />

                    {/* Upload */}
                    <div className="flex flex-col items-center gap-4">
                      <input ref={fileInputRef} type="file" onChange={handleFileUpload} accept="audio/*" className="hidden" />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isRecording || isProcessing}
                        className="w-24 h-24 rounded-[2.5rem] bg-white border-2 border-[#2D88FF]/10 flex items-center justify-center text-[#2D88FF] shadow-sm hover:border-[#2D88FF] transition-all"
                      >
                        <Upload size={36} />
                      </motion.button>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[#65676B]">Upload Audio</span>
                    </div>
                  </div>

                  <div className="text-center space-y-2">
                    <h2 className="text-lg font-bold text-[#1C1E21] md:text-xl">
                      {isRecording ? 'အသံဖမ်းယူနေပါသည်...' : isProcessing ? 'Processing...' : 'အသံဖြင့် စတင်ပါ'}
                    </h2>
                    <div className="font-mono text-2xl font-bold tracking-widest text-[#2D88FF]">
                      {isRecording ? formatTime(timer) : '00:00'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'translate' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-black/5 space-y-6"
              >
                <div className="flex items-center justify-between bg-[#F0F2F5] p-2 rounded-2xl">
                  <div className="flex items-center gap-2 px-4 font-bold text-sm">
                    {transDirection === 'en-my' ? 'English' : 'Burmese'}
                  </div>
                  <button 
                    onClick={() => setTransDirection(prev => prev === 'en-my' ? 'my-en' : 'en-my')}
                    className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-[#2D88FF] hover:scale-110 transition-transform"
                  >
                    <ArrowRightLeft size={18} />
                  </button>
                  <div className="flex items-center gap-2 px-4 font-bold text-sm">
                    {transDirection === 'en-my' ? 'Burmese' : 'English'}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={transDirection === 'en-my' ? "Enter English text..." : "မြန်မာစာရိုက်ပါ..."}
                    className="w-full min-h-[150px] p-4 bg-transparent border-none focus:ring-0 text-xl font-medium placeholder:text-[#65676B]/40 resize-none"
                  />
                  {inputText && (
                    <button onClick={handleTranslate} disabled={isProcessing} className="absolute bottom-2 right-2 bg-[#2D88FF] text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-[#2D88FF]/20 flex items-center gap-2 hover:bg-[#1A73E8]">
                      {isProcessing ? <Loader2 className="animate-spin" size={18} /> : 'ဘာသာပြန်'}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'tts' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-black/5 space-y-6"
              >
                <div className="flex items-center gap-2 px-2 text-[#2D88FF]">
                  <Volume2 size={24} />
                  <h2 className="text-lg font-bold">စာသားမှ အသံဖတ်စနစ်</h2>
                </div>

                <div className="relative">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="ဖတ်လိုသော စာသားများကို ဤနေရာတွင် ရိုက်ထည့်ပါ..."
                    className="w-full min-h-[150px] p-4 bg-transparent border-none focus:ring-0 text-xl font-medium placeholder:text-[#65676B]/40 resize-none shadow-inner rounded-2xl bg-gray-50/50"
                  />
                  {inputText && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                       {lastAudioBase64 && (
                         <button 
                           onClick={handleDownloadAudio} 
                           className="bg-white text-[#2D88FF] border border-[#2D88FF] px-4 py-2 rounded-xl font-bold shadow-sm flex items-center gap-2 hover:bg-gray-50"
                           title="အသံဖိုင်အဖြစ် သိမ်းဆည်းရန်"
                         >
                           <Download size={18} />
                           Save File
                         </button>
                       )}
                       <button 
                         onClick={() => handleTTS()} 
                         disabled={isProcessing || isPlaying} 
                         className="bg-[#2D88FF] text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-[#2D88FF]/20 flex items-center gap-2 hover:bg-[#1A73E8] disabled:opacity-50"
                       >
                         {isPlaying ? <Volume2 className="animate-bounce" size={18} /> : isProcessing ? <Loader2 className="animate-spin" size={18} /> : <PlayCircle size={18} />}
                         {isPlaying ? 'ဖတ်နေသည်...' : 'နားထောင်မည်'}
                       </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Results Section */}
            {(outputText || isProcessing || error) && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2rem] shadow-sm border border-black/5 overflow-hidden flex flex-col"
              >
                <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#65676B]">Result</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleTTS(outputText)} 
                      disabled={!outputText || isPlaying} 
                      className={`p-2 hover:bg-[#F0F2F5] rounded-xl text-[#2D88FF] transition-all disabled:opacity-30 ${isPlaying ? 'animate-pulse bg-[#F0F2F5]' : ''}`}
                      title="အသံဖြင့် နားထောင်ရန်"
                    >
                      <Volume2 size={18} />
                    </button>
                    {lastAudioBase64 && (
                      <button 
                        onClick={handleDownloadAudio} 
                        className="p-2 hover:bg-[#F0F2F5] rounded-xl text-[#2D88FF] transition-all"
                        title="အသံဖိုင်ဒေါင်းလုဒ်လုပ်ရန်"
                      >
                        <Volume2 size={18} />
                        <span className="sr-only">Download Audio</span>
                        <Download size={14} className="-ml-1 inline" />
                      </button>
                    )}
                    <button onClick={() => copyToClipboard(outputText)} disabled={!outputText} className="p-2 hover:bg-[#F0F2F5] rounded-xl text-[#2D88FF] transition-all disabled:opacity-30">
                      <Copy size={18} />
                    </button>
                    <button onClick={exportToWord} disabled={!outputText} className="p-2 hover:bg-[#F0F2F5] rounded-xl text-[#2D88FF] transition-all disabled:opacity-30">
                      <Download size={18} />
                    </button>
                    <button onClick={() => setOutputText('')} disabled={!outputText} className="p-2 hover:bg-red-50 rounded-xl text-red-500 transition-all disabled:opacity-30">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="p-8 min-h-[150px] relative">
                  {isProcessing && !isRecording && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4">
                      <Loader2 size={42} className="animate-spin text-[#2D88FF]" />
                      <p className="text-sm font-bold text-[#65676B] animate-pulse">AI is working on it...</p>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-start gap-3 text-red-500 bg-red-50 p-4 rounded-2xl border border-red-100 mb-4 transition-all">
                      <AlertCircle size={20} className="shrink-0" />
                      <p className="text-sm font-bold leading-relaxed">{error}</p>
                    </div>
                  )}

                  {outputText ? (
                    <div className="text-[#1C1E21] text-lg leading-relaxed font-medium whitespace-pre-wrap">
                      {outputText}
                    </div>
                  ) : (
                    !isProcessing && <div className="text-[#65676B]/30 flex flex-col items-center justify-center gap-4 py-12">
                      <Sparkles size={48} className="opacity-20" />
                      <p className="text-sm font-bold italic">ရလဒ်များကို ဤနေရာတွင် ဖော်ပြပေးပါမည်...</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </div>

          {/* Toast Notification */}
          <AnimatePresence>
            {copied && (
              <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-[#2D88FF] text-white px-6 py-3 rounded-2xl shadow-xl font-bold flex items-center gap-2 z-[100]"
              >
                <CheckCircle2 size={18} />
                ကူးယူပြီးပါပြီ!
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

