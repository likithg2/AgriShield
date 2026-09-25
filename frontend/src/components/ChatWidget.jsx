import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, Menu, Plus, Clock, Mic, MicOff, Volume2, Loader, Square } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import { aiAPI, predictionsAPI } from '../utils/api';
import toast from 'react-hot-toast';

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // History states
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Voice states
  const isListeningRef = useRef(false);
  const [isListeningState, setIsListeningState] = useState(false);
  const setIsListening = (val) => {
    isListeningRef.current = val;
    setIsListeningState(val);
  };
  const isListening = isListeningState;

  const isConversationModeRef = useRef(false);
  const [isConversationModeState, setIsConversationModeState] = useState(false);
  const setConversationMode = (val) => {
    isConversationModeRef.current = val;
    setIsConversationModeState(val);
  };
  const isConversationMode = isConversationModeState;

  const [wasVoiceInput, setWasVoiceInput] = useState(false);
  const [playingAudioIdx, setPlayingAudioIdx] = useState(null);
  const [isAudioFetching, setIsAudioFetching] = useState(false);
  const currentAudioRef = useRef(null);
  const recognitionRef = useRef(null);
  
  const messagesEndRef = useRef(null);
  
  const { t, language } = useContext(LanguageContext);
  const { user } = useContext(AuthContext);



  const fetchSessions = async () => {
    try {
      const res = await aiAPI.getSessions();
      setSessions(res.data);
    } catch (err) {
      console.error("Failed to fetch sessions", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  const loadSession = async (sessionId) => {
    try {
      setIsLoading(true);
      const res = await aiAPI.getSessionMessages(sessionId);
      setMessages(res.data);
      setCurrentSessionId(sessionId);
      setIsSidebarOpen(false);
    } catch (err) {
      console.error("Failed to load session", err);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setIsSidebarOpen(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // STT Init
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        
        recognitionRef.current.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setInputMessage(transcript);
          setWasVoiceInput(true);
        };
        recognitionRef.current.onerror = (event) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
        };
        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (!recognitionRef.current) {
        toast.error("Speech recognition not supported in your browser.");
        return;
      }
      setInputMessage('');
      setWasVoiceInput(true);
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const playTTS = async (text, idx) => {
    if (playingAudioIdx !== null) return;
    setPlayingAudioIdx(idx);
    setIsAudioFetching(true);
    try {
      const reqLang = language || 'en';
      const res = await predictionsAPI.getAdvisoryAudio({ text, lang: reqLang });
      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      setIsAudioFetching(false);
      
      audio.onended = () => {
        setPlayingAudioIdx(null);
        currentAudioRef.current = null;
        if (isConversationModeRef.current) {
          if (!isListeningRef.current && recognitionRef.current) {
            setInputMessage('');
            setWasVoiceInput(true);
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch (e) {}
          }
        }
      };
      audio.play();
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate audio");
      setPlayingAudioIdx(null);
      setIsAudioFetching(false);
    }
  };

  const stopTTS = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setPlayingAudioIdx(null);
    setIsAudioFetching(false);
  };

  const sendMessageText = async (textToSubmit, isVoice = false) => {
    if (!textToSubmit.trim()) return;

    const newUserMessage = { role: 'user', content: textToSubmit.trim() };
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const chatHistory = [...messages, newUserMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      const res = await aiAPI.chat(chatHistory, language, currentSessionId);
      
      if (res.data.session_id && !currentSessionId) {
        setCurrentSessionId(res.data.session_id);
        fetchSessions(); // Refresh history list
      }
      
      const aiResponseText = res.data.response || res.data.reply || res.data.answer || "I'm sorry, I couldn't understand that.";
      const aiMessage = { role: 'assistant', content: aiResponseText };
      
      setMessages(prev => {
        const newMsgs = [...prev, aiMessage];
        if (isVoice) {
          playTTS(aiResponseText, newMsgs.length - 1);
        }
        return newMsgs;
      });
    } catch (err) {
      console.error("Chat error:", err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I am having trouble connecting to the server right now."
      }]);
    } finally {
      setIsLoading(false);
      if (isVoice) setWasVoiceInput(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    await sendMessageText(inputMessage, false);
  };

  useEffect(() => {
    if (wasVoiceInput && inputMessage && !isLoading) {
      sendMessageText(inputMessage, true);
      setWasVoiceInput(false);
    }
  }, [wasVoiceInput, inputMessage]);

  const toggleConversationMode = () => {
    const newVal = !isConversationMode;
    setConversationMode(newVal);
    if (newVal) {
      if (!isListeningRef.current && recognitionRef.current) {
        setInputMessage('');
        setWasVoiceInput(true);
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {}
      }
    } else {
      if (isListeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
        setIsListening(false);
      }
    }
  };

  if (!user || user.role !== 'farmer') {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsOpen(true)}
              className="bg-primary hover:bg-primary-dark text-black p-4 rounded-full shadow-lg shadow-primary/20 flex items-center justify-center transition-colors"
            >
              <MessageSquare className="w-6 h-6" />
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 right-0 w-[350px] sm:w-[400px] h-[500px] bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="bg-primary/10 border-b border-white/10 p-4 flex items-center justify-between z-20">
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-white/10 rounded-md transition-colors text-white">
                    <Menu className="w-5 h-5" />
                  </button>
                  <div className="bg-primary/20 p-2 rounded-full">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">AI Assistant</h3>
                    <p className="text-xs text-text-muted">Online</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-text-muted hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Body (Relative for Sidebar overlay) */}
              <div className="flex-1 relative flex flex-col overflow-hidden">
                {/* Sidebar Overlay */}
                <AnimatePresence>
                  {isSidebarOpen && (
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '-100%' }}
                      transition={{ type: 'tween', duration: 0.2 }}
                      className="absolute inset-y-0 left-0 w-3/4 max-w-[250px] bg-black/95 border-r border-white/10 z-10 flex flex-col shadow-2xl"
                    >
                      <div className="p-4 border-b border-white/10 flex justify-between items-center">
                        <h4 className="text-white font-semibold flex items-center gap-2">
                          <Clock className="w-4 h-4" /> History
                        </h4>
                        <button onClick={() => setIsSidebarOpen(false)} className="text-text-muted hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="p-3">
                        <button 
                          onClick={startNewChat}
                          className="w-full flex items-center gap-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg p-2.5 transition-colors text-sm font-medium"
                        >
                          <Plus className="w-4 h-4" /> New Chat
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-3 space-y-1">
                        {sessions.length === 0 ? (
                          <p className="text-xs text-text-muted text-center mt-4">No past chats.</p>
                        ) : (
                          sessions.map(session => (
                            <button
                              key={session.id}
                              onClick={() => loadSession(session.id)}
                              className={`w-full text-left p-2.5 rounded-lg text-sm truncate transition-colors ${currentSessionId === session.id ? 'bg-primary text-black font-medium' : 'text-text-muted hover:bg-white/10 hover:text-white'}`}
                            >
                              {session.title || 'Chat Session'}
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center text-text-muted mt-8">
                      <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Hello! I am your Post-Harvest AI Assistant.</p>
                      <p className="text-sm mt-1">How can I help you today?</p>
                    </div>
                  )}
                  
                  {messages.map((msg, idx) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl p-3 relative ${
                        msg.role === 'user' 
                          ? 'bg-primary text-black rounded-br-none' 
                          : 'bg-white/10 text-white rounded-bl-none pr-10'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        {msg.role === 'assistant' && (
                          <button
                            onClick={() => {
                              if (playingAudioIdx === idx && !isAudioFetching) {
                                stopTTS();
                              } else if (playingAudioIdx === null) {
                                playTTS(msg.content, idx);
                              }
                            }}
                            disabled={playingAudioIdx !== null && playingAudioIdx !== idx}
                            className="absolute right-2 top-2 p-1.5 rounded-full bg-black/40 text-text-muted hover:text-white transition-colors"
                            title={playingAudioIdx === idx && !isAudioFetching ? "Stop Audio" : "Play Audio"}
                          >
                            {playingAudioIdx === idx ? (
                              isAudioFetching ? <Loader className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 text-danger" fill="currentColor" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/10 rounded-2xl rounded-bl-none p-4 flex gap-2 items-center">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input Area */}
              <div className="p-4 bg-black/40 border-t border-white/10">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <button
                    type="button"
                    onClick={toggleConversationMode}
                    className={`p-2.5 rounded-xl transition-colors flex items-center justify-center shrink-0 ${isConversationMode ? 'bg-primary text-black animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    title="Continuous Voice Conversation"
                  >
                    {isConversationMode ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </button>

                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      if (wasVoiceInput && e.target.value === '') setWasVoiceInput(false);
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary transition-colors min-w-0"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isLoading}
                    className="bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-black p-2.5 rounded-xl transition-colors shrink-0"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default ChatWidget;
