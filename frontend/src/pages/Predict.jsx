import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Plot from 'react-plotly.js';
import { toast } from 'react-hot-toast';

import { Camera, Mic, Map as MapIcon, Volume2, Truck, Leaf, Loader, RotateCcw, CheckCircle, Check } from 'lucide-react';
import Button from '../components/Button';
import GlassCard from '../components/GlassCard';
import { AuthContext } from '../context/AuthContext';
import { LanguageContext } from '../context/LanguageContext';
import { ThemeContext } from '../context/ThemeContext';
import { predictionsAPI, shipmentsAPI, formatApiError } from '../utils/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ImageModal from '../components/ImageModal';

// Fix for leaflet marker icons in React
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CROP_LIST = [
  "Tomato", "Onion", "Potato", "Cucumber"
];

const DISTRICT_LIST = [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chitradurga", "Dakshina Kannada",
  "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu",
  "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga",
  "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagar", "Vijayapura", "Yadgir"
];

const VOICE_DISTRICT_ALIASES = {
  "bangalore urban": "Bengaluru Urban", "bengaluru urban": "Bengaluru Urban",
  "bangalore rural": "Bengaluru Rural", "bengaluru rural": "Bengaluru Rural",
  "bangalore": "Bengaluru Urban", "bengaluru": "Bengaluru Urban",
  "mysore": "Mysuru", "mysuru": "Mysuru", "bellary": "Ballari", "ballari": "Ballari",
  "belgaum": "Belagavi", "belagavi": "Belagavi", "bijapur": "Vijayapura", "vijayapura": "Vijayapura",
  "vijayapur": "Vijayapura", "gulbarga": "Kalaburagi", "kalaburagi": "Kalaburagi",
  "shimoga": "Shivamogga", "shivamogga": "Shivamogga", "mangalore": "Dakshina Kannada",
  "mangaluru": "Dakshina Kannada", "dakshina kannada": "Dakshina Kannada",
  "south canara": "Dakshina Kannada", "karwar": "Uttara Kannada", "uttara kannada": "Uttara Kannada",
  "north canara": "Uttara Kannada", "hubli": "Dharwad", "hubballi": "Dharwad",
  "dharwad": "Dharwad", "chikkaballapur": "Chikkaballapur", "chikkaballapura": "Chikkaballapur",
  "chamarajanagar": "Chamarajanagar", "chamarajanagara": "Chamarajanagar",
  "tumkur": "Tumakuru", "tumakuru": "Tumakuru", "madikeri": "Kodagu", "coorg": "Kodagu", "kodagu": "Kodagu",
  "bagalkot": "Bagalkot", "bidar": "Bidar", "chitradurga": "Chitradurga", "davangere": "Davangere",
  "gadag": "Gadag", "hassan": "Hassan", "haveri": "Haveri", "kolar": "Kolar", "koppal": "Koppal",
  "mandya": "Mandya", "raichur": "Raichur", "ramanagara": "Ramanagara", "ramanagar": "Ramanagara",
  "udupi": "Udupi", "vijayanagar": "Vijayanagar", "vijayanagara": "Vijayanagar", "yadgir": "Yadgir"
};

const VOICE_CROP_SYNONYMS = {
  tomato: "Tomato", tomatoes: "Tomato", tamatar: "Tomato", thakkali: "Tomato",
  potato: "Potato", potatoes: "Potato", aloo: "Potato", alu: "Potato", alugadde: "Potato",
  onion: "Onion", onions: "Onion", pyaz: "Onion", pyaaz: "Onion", kanda: "Onion", eerulli: "Onion",
  cucumber: "Cucumber", cucumbers: "Cucumber", kheera: "Cucumber", southekai: "Cucumber"
};

const VOICE_NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100
};

const encodeWAV = (samples, sampleRate = 16000) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (v, offset, str) => {
    for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

const parseVoiceCommand = (transcript) => {
  const clean = transcript
    .toLowerCase()
    .replace(/[,:;!?]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let foundCrop = null;
  for (const [syn, standard] of Object.entries(VOICE_CROP_SYNONYMS)) {
    const regex = new RegExp(`\\b${syn}\\b`, 'i');
    if (regex.test(clean)) {
      foundCrop = standard;
      break;
    }
  }
  if (!foundCrop) {
    for (const c of CROP_LIST) {
      if (clean.includes(c.toLowerCase())) {
        foundCrop = c;
        break;
      }
    }
  }

  let foundDistrict = null;
  const aliasKeys = Object.keys(VOICE_DISTRICT_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of aliasKeys) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(clean)) {
      foundDistrict = VOICE_DISTRICT_ALIASES[key];
      break;
    }
  }
  if (!foundDistrict) {
    for (const d of DISTRICT_LIST) {
      if (clean.includes(d.toLowerCase())) {
        foundDistrict = d;
        break;
      }
    }
  }

  let foundQty = null;
  const numRegex = /\b(\d+(?:\.\d+)?)\s*(?:tons?|tonnes?|t\b|quintals?|kg)?/i;
  const numMatch = clean.match(numRegex);
  if (numMatch) {
    foundQty = parseFloat(numMatch[1]);
  } else {
    for (const [w, val] of Object.entries(VOICE_NUMBER_WORDS)) {
      const wRegex = new RegExp(`\\b${w}\\s*(?:tons?|tonnes?|t\b)?`, 'i');
      if (wRegex.test(clean)) {
        foundQty = val;
        break;
      }
    }
  }

  let foundTemp = null;
  const tempMatch = clean.match(/(?:temp(?:erature)?)\s*(?:is|of|at)?\s*(\d+(?:\.\d+)?)/i);
  if (tempMatch) foundTemp = parseFloat(tempMatch[1]);

  let foundHumidity = null;
  const humMatch = clean.match(/(?:humidity)\s*(?:is|of|at)?\s*(\d+(?:\.\d+)?)/i);
  if (humMatch) foundHumidity = parseFloat(humMatch[1]);

  return { foundCrop, foundDistrict, foundQty, foundTemp, foundHumidity };
};

/**
 * Resizes an image file to max maxWidth x maxHeight while preserving aspect ratio,
 * and encodes it as JPEG at given quality (~0.7).
 * Gracefully falls back to raw data URL or null on failure.
 */
const compressImageToBase64 = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onerror = () => {
        // Fallback to uncompressed data URL if Image constructor fails
        resolve(readerEvent.target?.result || null);
      };
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(readerEvent.target?.result || null);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch (e) {
          console.warn('Image compression failed, using original:', e);
          resolve(readerEvent.target?.result || null);
        }
      };
      img.src = readerEvent.target?.result;
    };
    reader.readAsDataURL(file);
  });
};

const Prediction = () => {
  const { user } = useContext(AuthContext);
  const { t, language } = useContext(LanguageContext);
  const { isDark } = useContext(ThemeContext);

  const [formData, setFormData] = useState({
    crop: '',
    district: user?.district || 'Bengaluru Urban',
    temperature: 25.0,
    humidity: 60.0,
    road_condition: 'National Highway',
    actual_transit_days: 3.0,
    expected_transit_days: 1.5,
    harvest_date: new Date().toISOString().split('T')[0],
    quantity_tons: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageAnalysis, setImageAnalysis] = useState(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState(null);
  const [barAnimated, setBarAnimated] = useState(false);
  const outputRef = useRef(null);

  // Trigger bar animation from 0 when analysis result arrives
  useEffect(() => {
    if (imageAnalysis) {
      setBarAnimated(false);
      const timer = setTimeout(() => setBarAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [imageAnalysis]);

  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [voiceText, setVoiceText] = useState('');
  const [voiceParsedDetails, setVoiceParsedDetails] = useState(null);
  const [processingVoice, setProcessingVoice] = useState(false);

  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioSamplesRef = useRef([]);
  
  const [weatherData, setWeatherData] = useState(null);

  const [predictionResult, setPredictionResult] = useState(null);
  const [advisoryAudioUrl, setAdvisoryAudioUrl] = useState(null);
  const [fetchingAudio, setFetchingAudio] = useState(false);
  const [animatedSpoilageProb, setAnimatedSpoilageProb] = useState(0);

  // Animate the Spoilage Probability Gauge
  useEffect(() => {
    if (predictionResult && predictionResult.spoilage_probability != null) {
      let start = 0;
      const target = predictionResult.spoilage_probability * 100;
      const duration = 1500; // 1.5s
      const stepTime = 16; // ~60fps
      const increment = target / (duration / stepTime);

      const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
          setAnimatedSpoilageProb(target);
          clearInterval(timer);
        } else {
          setAnimatedSpoilageProb(start);
        }
      }, stepTime);

      return () => clearInterval(timer);
    }
  }, [predictionResult]);


  // Reset selected facility when prediction result changes
  useEffect(() => {
    if (predictionResult) {
      setSelectedFacilityIdx(0);
      setBookingMode('random');
      setVehicleReg('');
      setBookingDetails(null);
      // Auto-scroll to output
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [predictionResult]);

  const [activeLang, setActiveLang] = useState('en');
  const [isBooking, setIsBooking] = useState(false);
  const [selectedFacilityIdx, setSelectedFacilityIdx] = useState(0);
  const [bookingMode, setBookingMode] = useState('random');
  const [vehicleReg, setVehicleReg] = useState('');
  const [bookingDetails, setBookingDetails] = useState(null);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [bookingTarget, setBookingTarget] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);

  useEffect(() => {
    setIsBooking(false);
    setShowBookingConfirm(false);
  }, [selectedFacilityIdx, bookingMode]);


  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (!formData.district || !DISTRICT_LIST.includes(formData.district)) {
      return;
    }
    const safeDistrict = DISTRICT_LIST.find(d => d === formData.district);
    if (!safeDistrict) return;

    let isMounted = true;
    predictionsAPI.getWeather(safeDistrict)
      .then(res => {
        if (!isMounted) return;
        const data = res.data;
        if (data && data.temp && data.humidity) {
           setFormData(prev => ({ ...prev, temperature: data.temp, humidity: data.humidity }));
           setWeatherData(data);
        }
      })
      .catch(err => console.error("Weather fetch failed:", err));

    return () => {
      isMounted = false;
    };
  }, [formData.district]);

  // Image Upload Logic
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAnalyzingImage(true);
    
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    
    try {
      const res = await predictionsAPI.analyzeImage(formDataObj);
      const data = res.data;
      setImageAnalysis(data);
      if (CROP_LIST.includes(data.crop_name)) {
        setFormData(prev => ({ ...prev, crop: data.crop_name }));
      }
    } catch (err) {
      console.error(err);
      toast.error(formatApiError(err, "Failed to analyze image"));
    } finally {
      setAnalyzingImage(false);
    }
  };

  // Voice Recording & Parsing Logic
  const applyVoiceData = (parsed, transcript) => {
    setVoiceText(transcript);
    setVoiceParsedDetails(parsed);
    setFormData(prev => ({
      ...prev,
      ...(parsed.foundCrop && { crop: parsed.foundCrop }),
      ...(parsed.foundDistrict && { district: parsed.foundDistrict }),
      ...(parsed.foundQty && { quantity_tons: parsed.foundQty }),
      ...(parsed.foundTemp != null && { temperature: parsed.foundTemp }),
      ...(parsed.foundHumidity != null && { humidity: parsed.foundHumidity })
    }));

    const extractedItems = [
      parsed.foundCrop && `Crop: ${parsed.foundCrop}`,
      parsed.foundDistrict && `District: ${parsed.foundDistrict}`,
      parsed.foundQty && `Qty: ${parsed.foundQty}T`,
      parsed.foundTemp != null && `Temp: ${parsed.foundTemp}°C`,
      parsed.foundHumidity != null && `Humidity: ${parsed.foundHumidity}%`
    ].filter(Boolean);

    if (extractedItems.length > 0) {
      toast.success(`Voice Recognized: ${extractedItems.join(' • ')}`);
    } else {
      toast.info(`Transcribed: "${transcript}". Please mention crop, district, or quantity (e.g. "Tomato in Kolar, 10 tons").`);
    }
  };

  const startAudioStreamFallback = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Audio recording is not supported in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;
      audioSamplesRef.current = [];

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioSamplesRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsRecording(true);
      setMediaRecorder({ type: 'stream' });
    } catch (err) {
      console.error("Audio recording fallback error:", err);
      toast.error("Microphone access error: " + (err.message || "Permission denied"));
    }
  };

  const stopAudioStreamFallback = async () => {
    try {
      setIsRecording(false);
      setProcessingVoice(true);
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect();
        audioProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        await audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }

      const totalLength = audioSamplesRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
      if (totalLength === 0) {
        setProcessingVoice(false);
        toast.info("No audio recorded. Please try speaking again.");
        return;
      }
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of audioSamplesRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      audioSamplesRef.current = [];

      const wavBlob = encodeWAV(merged, 16000);
      const fd = new FormData();
      fd.append("file", wavBlob, "voice_command.wav");
      const reqLang = language === 'kn' ? 'kn-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
      fd.append("lang", reqLang);

      const res = await predictionsAPI.parseVoice(fd);
      const data = res.data;
      if (data && data.text) {
        applyVoiceData({
          foundCrop: data.crop,
          foundDistrict: data.district,
          foundQty: data.quantity,
          foundTemp: data.temperature,
          foundHumidity: data.humidity
        }, data.text);
      }
    } catch (err) {
      console.error("Backend voice parse failed:", err);
      toast.error(err.response?.data?.detail || "Failed to process voice audio.");
    } finally {
      setProcessingVoice(false);
    }
  };

  const startRecording = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        const reqLang = language === 'kn' ? 'kn-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
        recognition.lang = reqLang;

        recognition.onstart = () => {
          setIsRecording(true);
          setProcessingVoice(false);
        };

        recognition.onresult = (event) => {
          setProcessingVoice(true);
          const transcript = event.results[0][0].transcript;
          const parsed = parseVoiceCommand(transcript);
          applyVoiceData(parsed, transcript);
          setProcessingVoice(false);
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error", event.error);
          setIsRecording(false);
          setProcessingVoice(false);
          if (event.error === 'not-allowed') {
            toast.error("Microphone access denied. Please allow microphone permissions in your browser.");
          } else if (event.error === 'no-speech') {
            toast.error("No speech detected. Please speak closer to your mic and try again.");
          } else if (event.error === 'network') {
            toast.error("Speech network error. Falling back to audio recording...");
            void startAudioStreamFallback();
          } else if (event.error === 'audio-capture') {
            toast.error("No microphone detected on your system.");
          } else {
            toast.error(`Voice error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        setMediaRecorder(recognition);
        return;
      } catch (err) {
        console.warn("SpeechRecognition init failed, falling back to AudioStream", err);
      }
    }

    // Fallback for browsers without SpeechRecognition
    await startAudioStreamFallback();
  };
  
  const stopRecording = () => {
    if (mediaRecorder) {
      if (mediaRecorder.type === 'stream') {
        void stopAudioStreamFallback();
      } else if (mediaRecorder.stop) {
        mediaRecorder.stop();
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };

  // Main Analysis Submit
  
  const fetchAdvisoryAudio = async (text, lang) => {
    setFetchingAudio(true);
    try {
      const res = await predictionsAPI.getAdvisoryAudio({ text, lang });
      const audioBlob = res.data;
      setAdvisoryAudioUrl(URL.createObjectURL(audioBlob));
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingAudio(false);
    }
  };

  const handleLangSwitch = (langCode) => {
    setActiveLang(langCode);
    if (!predictionResult) return;
    const text = langCode === 'kn' ? predictionResult.advisory_transcript_kn : predictionResult.advisory_transcript_en;
    void fetchAdvisoryAudio(text, langCode);
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // 1. Submit Prediction
      const prob = imageAnalysis ? imageAnalysis.rotten_pct / 100 : null;
      
      // Calculate storage days
      const hDate = new Date(formData.harvest_date);
      const today = new Date();
      const diffTime = Math.abs(today - hDate);
      const storageDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Compress and convert image file to base64 if it exists (capped to 800x800 JPEG 0.7)
      let base64Image = null;
      if (imageFile) {
        base64Image = await compressImageToBase64(imageFile);
      }
      
      const payload = {
        ...formData,
        temperature: Number.parseFloat(formData.temperature) || 25.0,
        humidity: Number.parseFloat(formData.humidity) || 60.0,
        actual_transit_days: Number.parseFloat(formData.actual_transit_days) || 1.0,
        expected_transit_days: Number.parseFloat(formData.expected_transit_days) || 1.0,
        storage_days: Number.isNaN(storageDays) ? 0 : storageDays,
        quantity_tons: Number.parseFloat(formData.quantity_tons),
        picture_spoilage_prob: prob,
        image_data: base64Image
      };
      
      const res = await predictionsAPI.create(payload);
      const data = res.data;
      setPredictionResult(data);
      
      // 2. Fetch Audio Advisory
      setActiveLang('en');
      void fetchAdvisoryAudio(data.advisory_transcript_en, 'en');
      
    } catch (err) {
      const errorMsg = formatApiError(err, "Prediction failed. Please check your inputs and try again.");
      setError(errorMsg);
      toast.error(errorMsg.length > 70 ? "Prediction Failed" : errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPredictionResult(null);
    setImageFile(null);
    setImagePreview(null);
    setImageAnalysis(null);
    setError('');
    setFormData({
      crop: '',
      district: user?.district || 'Bengaluru Urban',
      temperature: weatherData?.temp || 25.0,
      humidity: weatherData?.humidity || 60.0,
      road_condition: 'National Highway',
      actual_transit_days: 3.0,
      expected_transit_days: 1.5,
      harvest_date: new Date().toISOString().split('T')[0],
      quantity_tons: ''
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-green-600 bg-clip-text text-transparent">
            {t("ML Prediction")}
          </h1>
          <p className="text-text-muted mt-1">{t("Post-Harvest Loss Prediction AI")}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* Environmental Telemetry */}
      {weatherData && (
        <div className="space-y-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <span className={weatherData.status === 'success' ? 'text-green-500' : 'text-yellow-500'}>
              {weatherData.status === 'success' ? '🟢 Live Telemetry Synchronized' : '🟡 Using baseline climate models'}
            </span>
            <span className="text-text-muted">— {weatherData.desc} conditions in {formData.district}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-4">
            <GlassCard className="p-4 flex flex-col items-center justify-center text-center bg-black/20 border-white/5 hover:border-primary/50 transition-colors">
              <div className="text-2xl mb-2 notranslate" translate="no">🌡️</div>
              <div className="text-xl font-bold">{weatherData.temp.toFixed(1)}°C</div>
              <div className="text-xs text-text-muted uppercase mt-1">Temperature</div>
            </GlassCard>
            <GlassCard className="p-4 flex flex-col items-center justify-center text-center bg-black/20 border-white/5 hover:border-primary/50 transition-colors">
              <div className="text-2xl mb-2 notranslate" translate="no">💧</div>
              <div className="text-xl font-bold">{weatherData.humidity.toFixed(0)}%</div>
              <div className="text-xs text-text-muted uppercase mt-1">Humidity</div>
            </GlassCard>
            <GlassCard className="p-4 flex flex-col items-center justify-center text-center bg-black/20 border-white/5 hover:border-primary/50 transition-colors">
              <div className="text-2xl mb-2 notranslate" translate="no">💨</div>
              <div className="text-xl font-bold">{weatherData.wind.toFixed(1)} km/h</div>
              <div className="text-xs text-text-muted uppercase mt-1">Wind Speed</div>
            </GlassCard>
            <GlassCard className="p-4 flex flex-col items-center justify-center text-center bg-black/20 border-white/5 hover:border-primary/50 transition-colors">
              <div className="text-2xl mb-2 notranslate" translate="no">🌧️</div>
              <div className="text-xl font-bold">{weatherData.rain.toFixed(1)} mm</div>
              <div className="text-xs text-text-muted uppercase mt-1">Rainfall (1h)</div>
            </GlassCard>
            <GlassCard className="p-4 flex flex-col items-center justify-center text-center bg-black/20 border-white/5 hover:border-primary/50 transition-colors">
              <div className="text-2xl mb-2 notranslate" translate="no">☁️</div>
              <div className="text-xl font-bold">{weatherData.clouds}%</div>
              <div className="text-xs text-text-muted uppercase mt-1">Cloud Cover</div>
            </GlassCard>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* INPUTS SECTION */}
        <div className="space-y-6">
          
          {/* Vegetable Quality Analysis */}
          <GlassCard className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Camera className="text-primary" /> {t("Vegetable Quality Analysis")}
            </h2>
            <div className="space-y-4">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
              
              {analyzingImage && <div className="text-primary animate-pulse flex items-center gap-2"><Loader className="animate-spin" size={16}/> Analyzing image with MobileNetV2...</div>}
              
              {imagePreview && (
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-background/50 p-4 rounded-xl border border-white/5">
                  <img 
                    src={imagePreview} 
                    alt="Upload" 
                    className="w-24 h-24 object-cover rounded-lg shadow-md cursor-pointer hover:opacity-80 transition-opacity shrink-0" 
                    onClick={() => {
                      setModalImageSrc(imagePreview);
                      setIsModalOpen(true);
                    }}
                  />
                  <AnimatePresence>
                  {imageAnalysis && (
                    <motion.div 
                      className="w-full sm:flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <motion.div 
                        className="bg-background/40 p-3 rounded-xl border border-white/5 flex flex-col justify-center shadow-inner"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Detected Crop</div>
                        <div className="text-lg font-bold text-green-800 dark:text-green-400">{imageAnalysis.crop_name}</div>
                      </motion.div>
                      <motion.div 
                        className="bg-background/40 p-3 rounded-xl border border-white/5 flex flex-col justify-center shadow-inner"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                      >
                        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Overall Quality</div>
                        <div className={`text-lg font-bold ${imageAnalysis.quality === 'Rotten' ? 'text-red-400' : 'text-green-400'}`}>
                          {imageAnalysis.quality}
                        </div>
                      </motion.div>
                      <motion.div 
                        className="col-span-2 bg-background/40 p-4 rounded-2xl border border-white/5 shadow-inner"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.35 }}
                      >
                        <div className="w-full h-14 overflow-hidden flex" style={{ background: 'rgba(0,0,0,0.1)', borderRadius: '5px' }}>
                          <div 
                            className="h-full flex items-center justify-center relative"
                            style={{
                              width: barAnimated ? `${Math.max(imageAnalysis.fresh_pct, 18)}%` : '0%',
                              background: 'linear-gradient(90deg, rgba(74,222,128,0.45), rgba(34,197,94,0.55))',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                              borderRadius: '5px 0 0 5px',
                              transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              overflow: 'hidden',
                            }}
                          >
                            <span className="text-lg font-bold text-green-900 dark:text-green-100 drop-shadow-sm whitespace-nowrap" style={{ opacity: barAnimated ? 1 : 0, transition: 'opacity 0.5s ease 0.8s' }}>🌿 Fresh {imageAnalysis.fresh_pct.toFixed(1)}%</span>
                          </div>
                          <div 
                            className="h-full flex items-center justify-center relative"
                            style={{
                              width: barAnimated ? `${Math.max(imageAnalysis.rotten_pct, 18)}%` : '0%',
                              background: 'linear-gradient(90deg, rgba(248,113,113,0.45), rgba(239,68,68,0.55))',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                              borderRadius: '0 5px 5px 0',
                              transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              overflow: 'hidden',
                            }}
                          >
                            <span className="text-lg font-bold text-red-900 dark:text-red-100 drop-shadow-sm whitespace-nowrap" style={{ opacity: barAnimated ? 1 : 0, transition: 'opacity 0.5s ease 0.8s' }}>⚠️ Spoilage {imageAnalysis.rotten_pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.9 }}
                        >
                        {imageAnalysis.rotten_pct > 50 ? (
                          <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                            <span className="text-2xl mt-0.5">🚨</span>
                            <p className="text-sm text-red-400 font-medium leading-snug">
                              High spoilage detected! Move your produce to cold storage immediately to minimize losses.
                            </p>
                          </div>
                        ) : imageAnalysis.rotten_pct > 25 ? (
                          <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                            <span className="text-2xl mt-0.5">⚡</span>
                            <p className="text-lg text-orange-400 font-medium leading-snug">
                              Moderate spoilage risk. Consider expediting transport to cold storage for better shelf life.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                            <span className="text-2xl mt-0.5">✅</span>
                            <p className="text-base text-green-400 font-medium leading-snug">
                              Your produce looks fresh! Store properly and transport within the recommended window.
                            </p>
                          </div>
                        )}
                        <Button type="button" onClick={handleReset} variant="outline" className="mt-4 w-full flex items-center justify-center gap-2">
                          <RotateCcw className="w-4 h-4" />
                          {t("New Prediction")}
                        </Button>
                        </motion.div>
                      </motion.div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Voice Input */}
          <GlassCard className="p-6 bg-gradient-to-br from-primary/5 to-transparent border border-primary/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Mic className={isRecording ? "text-red-500 animate-pulse" : "text-primary"} /> 
                {t("AI Voice Command Gateway")}
              </h2>
              {isRecording && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  Listening... speak now
                </span>
              )}
            </div>
            <p className="text-sm text-text-muted mb-4">{t("Tap mic and clearly state criteria (e.g., 'Tomato in Kolar, 10 Tons')")}</p>
            
            <div className="flex flex-wrap items-center gap-3">
              {!isRecording ? (
                <Button onClick={startRecording} className="bg-red-500 hover:bg-red-600 shadow-red-500/30 text-white rounded-full px-6 flex items-center gap-2">
                  <span className="w-2 h-2 bg-white rounded-full"></span> Tap to Speak
                </Button>
              ) : (
                <Button onClick={stopRecording} className="bg-gray-800 hover:bg-gray-700 text-white rounded-full px-6 flex items-center gap-2 border-2 border-red-500 animate-pulse">
                  <span className="w-3 h-3 bg-red-500 rounded-sm"></span> Stop Recording
                </Button>
              )}
              {processingVoice && (
                <span className="text-primary text-sm flex items-center gap-2 animate-pulse">
                  <Loader className="animate-spin" size={16}/> Transcribing & parsing parameters...
                </span>
              )}
              {voiceText && (
                <button
                  type="button"
                  onClick={() => { setVoiceText(''); setVoiceParsedDetails(null); }}
                  className="text-xs text-text-muted hover:text-danger underline ml-auto cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            
            {voiceText && (
              <div className="mt-4 p-4 bg-black/20 rounded-xl border border-white/10 space-y-2">
                <div className="text-sm">
                  🗣️ <strong>AI Transcribed:</strong> <span className="italic font-medium text-text-main">"{voiceText}"</span>
                </div>
                {voiceParsedDetails && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    {voiceParsedDetails.foundCrop && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/30">
                        🌱 Crop: {voiceParsedDetails.foundCrop}
                      </span>
                    )}
                    {voiceParsedDetails.foundDistrict && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                        📍 District: {voiceParsedDetails.foundDistrict}
                      </span>
                    )}
                    {voiceParsedDetails.foundQty && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                        ⚖️ Qty: {voiceParsedDetails.foundQty} Tons
                      </span>
                    )}
                    {voiceParsedDetails.foundTemp != null && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30">
                        🌡️ Temp: {voiceParsedDetails.foundTemp}°C
                      </span>
                    )}
                    {voiceParsedDetails.foundHumidity != null && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                        💧 Humidity: {voiceParsedDetails.foundHumidity}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </GlassCard>

          {/* Manual Input Form */}
          <GlassCard className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Leaf className="text-primary" /> {t("Input Parameters")}
            </h2>
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="predict-crop-select" className="text-xs text-text-muted font-medium mb-1 block">Select Crop</label>
                  <select id="predict-crop-select" name="crop" value={formData.crop} onChange={handleChange} className="input-field bg-white text-gray-900 border border-gray-300 w-full dark:bg-black/90 dark:text-white dark:border-white/10" required>
                    <option value="" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">-- Select --</option>
                    {CROP_LIST.map(c => <option key={c} value={c} className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="predict-district-select" className="text-xs text-text-muted font-medium mb-1 block">District</label>
                  <select id="predict-district-select" name="district" value={formData.district} onChange={handleChange} className="input-field bg-white text-gray-900 border border-gray-300 w-full dark:bg-black/90 dark:text-white dark:border-white/10" required>
                    {DISTRICT_LIST.map(d => <option key={d} value={d} className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="predict-quantity-input" className="text-xs text-text-muted font-medium mb-1 block">Quantity (Tons)</label>
                  <input id="predict-quantity-input" type="number" step="0.1" name="quantity_tons" value={formData.quantity_tons} onChange={handleChange} placeholder="e.g. 10" className="input-field bg-primary/5 w-full" required />
                </div>
                <div>
                  <label htmlFor="predict-harvest-date-input" className="text-xs text-text-muted font-medium mb-1 block">Harvest Date</label>
                  <input 
                    id="predict-harvest-date-input"
                    type="date" 
                    name="harvest_date" 
                    value={formData.harvest_date} 
                    onChange={handleChange} 
                    max={new Date().toISOString().split('T')[0]} 
                    className="input-field bg-primary/5 w-full cursor-pointer"
                    onClick={(e) => {
                      try {
                        if (typeof e.target.showPicker === 'function') {
                          e.target.showPicker();
                        }
                      } catch (err) {}
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="predict-temperature-input" className="text-xs text-text-muted font-medium mb-1 block">Temp (°C)</label>
                  <input id="predict-temperature-input" type="number" step="0.1" name="temperature" value={formData.temperature} onChange={handleChange} className="input-field bg-primary/5 w-full" />
                </div>
                <div>
                  <label htmlFor="predict-humidity-input" className="text-xs text-text-muted font-medium mb-1 block">Humidity (%)</label>
                  <input id="predict-humidity-input" type="number" step="0.1" name="humidity" value={formData.humidity} onChange={handleChange} className="input-field bg-primary/5 w-full" />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label htmlFor="predict-spoilage-prob-input" className="text-xs text-text-muted font-medium mb-1 block">Picture Spoilage Prob</label>
                  <input id="predict-spoilage-prob-input" type="text" disabled value={imageAnalysis ? imageAnalysis.rotten_pct.toFixed(1) + '%' : 'Not Analyzed'} className="input-field bg-primary/5 w-full opacity-70" />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4">
                <Button type="submit" className="flex-1 py-4 text-lg font-bold shadow-lg shadow-primary/30" disabled={loading}>
                  {loading ? 'Analyzing...' : t("Analyze Spoilage Risk")}
                </Button>
                
                <AnimatePresence>
                  {predictionResult && (
                    <motion.div
                      initial={{ opacity: 0, width: 0, scale: 0.8 }}
                      animate={{ opacity: 1, width: 'auto', scale: 1 }}
                      exit={{ opacity: 0, width: 0, scale: 0.8 }}
                      transition={{ duration: 0.3 }}
                      className="flex"
                    >
                      <Button type="button" onClick={handleReset} variant="outline" className="h-full px-6 flex items-center justify-center gap-2">
                        <RotateCcw className="w-5 h-5" />
                        <span className="hidden sm:inline">{t("New")}</span>
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </form>
          </GlassCard>

        </div>


        {/* OUTPUTS SECTION */}
        <div className="space-y-6" ref={outputRef}>
          {predictionResult ? (
            <>
              
              {/* Risk Overview */}
              <GlassCard className="p-6 overflow-hidden relative">
                <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl -mr-10 -mt-10 rounded-full opacity-30 pointer-events-none 
                  ${predictionResult.risk_level === 'HIGH' ? 'bg-red-500' : predictionResult.risk_level === 'MEDIUM' ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                
                <h2 className="text-2xl font-bold mb-4">{t("Prediction Output")}</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="flex justify-center items-center bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-xl shadow-inner backdrop-blur-sm p-2 w-full overflow-hidden">
                      <Plot
                        data={[
                          {
                            type: "indicator",
                            mode: "gauge+number",
                            value: animatedSpoilageProb,
                            number: { suffix: "%", font: { color: isDark ? "#ffffff" : "#064e3b" } },
                            gauge: {
                              axis: { range: [0, 100], tickwidth: 1, tickcolor: isDark ? "#ffffff" : "#064e3b", dtick: 10 },
                              bar: { color: predictionResult.risk_level === 'HIGH' ? "#ef4444" : predictionResult.risk_level === 'MEDIUM' ? "#f97316" : "#22c55e" },
                              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                              borderwidth: 0,
                            },
                            title: { text: "Spoilage Probability", font: { color: isDark ? "#ffffff" : "#064e3b", size: 16 } }
                          }
                        ]}
                        layout={{
                          autosize: true,
                          height: 250,
                          margin: { t: 40, b: 20, l: 35, r: 35 },
                          paper_bgcolor: "rgba(0,0,0,0)",
                          font: { color: isDark ? "#ffffff" : "#1f2937" }
                        }}
                        useResizeHandler={true}
                        style={{ width: "100%", maxWidth: "340px", height: "250px" }}
                        config={{ displayModeBar: false }}
                      />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-background/40 p-4 rounded-xl border border-white/5">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Risk Level</div>
                      <div className={`text-2xl font-bold ${
                        predictionResult.risk_level === 'HIGH' ? 'text-red-500' : 
                        predictionResult.risk_level === 'MEDIUM' ? 'text-orange-500' : 'text-green-500'
                      }`}>{predictionResult.risk_level}</div>
                    </div>
                    <div className="bg-background/40 p-4 rounded-xl border border-white/5">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Qty Loss (Tons)</div>
                      <div className="text-2xl font-bold">{((predictionResult.loss_percentage / 100) * formData.quantity_tons).toFixed(2)} T</div>
                    </div>
                    <div className="bg-background/40 p-4 rounded-xl border border-white/5">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Est. Financial Loss</div>
                      <div className="text-2xl font-bold text-red-400">~ ₹{Math.round(predictionResult.financial_loss).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* AI Audio Advisory */}
                <div className="bg-gradient-to-r from-gray-100 to-green-50 dark:from-gray-900 dark:to-green-900/20 border border-green-200 dark:border-green-900/50 rounded-xl p-4 mt-4 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-green-700 dark:text-primary flex items-center gap-2">
                      <Volume2 size={18} /> GenAI Dynamic Advisory
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => handleLangSwitch('en')} className={`px-3 py-1 rounded text-xs font-semibold ${activeLang === 'en' ? 'bg-primary text-white shadow-md' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-text-muted hover:bg-gray-300 dark:hover:bg-white/20'}`}>English</button>
                      <button onClick={() => handleLangSwitch('kn')} className={`px-3 py-1 rounded text-xs font-semibold ${activeLang === 'kn' ? 'bg-primary text-white shadow-md' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-text-muted hover:bg-gray-300 dark:hover:bg-white/20'}`}>Kannada</button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-green-900 dark:text-green-50 mb-4 italic p-3 bg-green-100/70 dark:bg-green-900/40 rounded-lg border border-green-300 dark:border-green-700/50 whitespace-pre-wrap shadow-inner">
                    {activeLang === 'kn' ? predictionResult.advisory_transcript_kn : predictionResult.advisory_transcript_en}
                  </p>
                  
                  {fetchingAudio ? (
                    <div className="text-sm text-primary animate-pulse">Generating localized audio...</div>
                  ) : advisoryAudioUrl ? (
                    <audio controls className="w-full h-10 outline-none" autoPlay src={advisoryAudioUrl}>
                      Your browser does not support the audio element.
                    </audio>
                  ) : null}
                </div>
              </GlassCard>


              
              
              {/* Map & Logistics */}
              <GlassCard className="p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <MapIcon className="text-primary" /> {t("Top 3 Optimal Storage Facilities")}
                </h2>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-text-muted text-sm uppercase tracking-wider">
                        <th className="p-3">Facility</th>
                        <th className="p-3">Distance</th>
                        <th className="p-3">Mandi Rate</th>
                        <th className="p-3">Net Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictionResult.top_facilities && predictionResult.top_facilities.map((fac, idx) => (
                        <tr 
                          key={idx} 
                          onClick={() => setSelectedFacilityIdx(idx)}
                          className={`border-b border-white/5 cursor-pointer transition-colors ${selectedFacilityIdx === idx ? 'bg-primary/20 border-l-4 border-l-primary' : 'hover:bg-white/5 border-l-4 border-l-transparent'}`}
                        >
                          <td className="p-3 font-semibold">{fac.facility_name} <span className="text-xs text-text-muted block">{fac.district}</span></td>
                          <td className="p-3">{fac.physical_distance_km.toFixed(1)} km</td>
                          <td className="p-3 text-green-400">₹{fac.mandi_price_per_kg}/kg</td>
                          <td className="p-3 font-bold text-primary">₹{fac.net_estimated_payout.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Booking Panel */}
                  {predictionResult.top_facilities && predictionResult.top_facilities[selectedFacilityIdx] && (
                    <div className="bg-white/10 p-5 rounded-xl border border-white/20 shadow-lg backdrop-blur-md">
                      <h3 className="text-lg font-bold mb-4 text-primary">Booking Details</h3>
                      
                      {(() => {
                        const fac = predictionResult.top_facilities[selectedFacilityIdx];
                        const isFull = fac.available_capacity_tons < formData.quantity_tons;
                        
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-text-muted block">Selected Warehouse</span>
                                <span className="font-semibold">{fac.facility_name}</span>
                              </div>
                              <div>
                                <span className="text-text-muted block">Detected Crop</span>
                                <span className="font-semibold text-green-800 dark:text-green-400">{predictionResult.crop}</span>
                              </div>
                              <div>
                                <span className="text-text-muted block">Est. Market Price</span>
                                <span className="font-semibold text-green-400">₹{(fac.mandi_price_per_kg * 1000).toLocaleString()} / Ton</span>
                              </div>
                              <div>
                                <span className="text-text-muted block">Storage Rent</span>
                                <span className="font-semibold text-orange-400">₹{fac.price_per_ton_day ? fac.price_per_ton_day.toFixed(2) : '180.00'} / Ton / Day</span>
                              </div>
                              <div>
                                <span className="text-text-muted block">Available Space</span>
                                <span className={`font-semibold ${isFull ? 'text-red-500' : 'text-primary'}`}>
                                  {fac.available_capacity_tons.toFixed(1)} T
                                </span>
                              </div>
                              <div>
                                <span className="text-text-muted block">Total Capacity</span>
                                <span className="font-semibold text-primary">
                                  {fac.capacity_mt.toFixed(1)} T
                                </span>
                              </div>
                              <div className="col-span-2 md:col-span-3">
                                <span className="text-text-muted block">Freezer Condition</span>
                                <span className={`font-bold ${fac.base_temp_c > 4.0 ? 'text-red-500' : 'text-green-500'}`}>
                                  {fac.base_temp_c > 4.0 ? '🚨 Critical / Not Working' : '✅ Normal'}
                                </span>
                              </div>
                            </div>
                            
                            {isFull ? (
                              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg border border-red-500/30 text-center font-bold mt-4">
                                🚨 Warehouse Capacity Full
                              </div>
                            ) : (
                              <>
                                <div className="border-t border-white/10 pt-4">
                                  {bookingDetails ? (
                                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-center shadow-lg">
                                      <div className="text-green-700 dark:text-green-400 font-bold text-lg mb-1 flex items-center justify-center gap-2">
                                        <Check size={20} /> Booking Confirmed
                                      </div>
                                      <div className="text-sm text-text-muted mb-3">at {bookingDetails.facilityName}</div>
                                      <div className="text-gray-900 dark:text-white bg-white/50 dark:bg-black/30 py-2 rounded-lg border border-glass-border">
                                        <span className="text-xs text-text-muted block mb-1 uppercase tracking-wider">Vehicle Assigned</span>
                                        <span className="text-primary font-mono font-bold text-lg">{bookingDetails.vehicleReg.toUpperCase()}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex flex-col gap-2 mb-4">
                                        <button 
                                          onClick={() => {
                                            setBookingMode('random');
                                            setVehicleReg('');
                                          }}
                                          className={`w-full py-2 px-4 text-sm font-semibold rounded-lg border transition-colors ${bookingMode === 'random' ? 'bg-primary text-white border-primary' : 'bg-transparent text-text-muted border-white/20 hover:bg-white/5'}`}
                                        >
                                          Book Vehicle and Slot
                                        </button>
                                        <button 
                                          onClick={() => {
                                            setBookingMode('manual');
                                            setVehicleReg('');
                                          }}
                                          className={`w-full py-2 px-4 text-sm font-semibold rounded-lg border transition-colors ${bookingMode === 'manual' ? 'bg-primary text-white border-primary' : 'bg-transparent text-text-muted border-white/20 hover:bg-white/5'}`}
                                        >
                                          If you have a vehicle, book a slot
                                        </button>
                                      </div>
                                  
                                  {bookingMode === 'manual' && (
                                    <div className="mb-4">
                                      <label htmlFor="vehicle-reg-input" className="text-xs text-text-muted block mb-1">Vehicle Registration Number</label>
                                      <input 
                                        id="vehicle-reg-input"
                                        type="text" 
                                        placeholder="e.g. KA01AB1234" 
                                        value={vehicleReg}
                                        maxLength={10}
                                        onChange={(e) => setVehicleReg(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                                        className="input-field bg-primary/5 w-full uppercase"
                                      />
                                    </div>
                                  )}
                                  
                                  {showBookingConfirm ? (
                                    <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                                      <p className="text-sm text-orange-700 dark:text-orange-400 font-semibold mb-3">Are you sure you want to book a slot at this facility?</p>
                                      <div className="flex gap-3">
                                        <Button 
                                          variant="outline" 
                                          className="flex-1 py-2 text-sm border-orange-500/50 text-orange-700 dark:text-orange-400 hover:bg-orange-500/10"
                                          onClick={() => setShowBookingConfirm(false)}
                                        >
                                          Cancel
                                        </Button>
                                        <Button 
                                          type="button"
                                          className="flex-1 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white border-0"
                                          onClick={async () => {
                                              setShowBookingConfirm(false);
                                              const token = localStorage.getItem('auth_token');
                                              if (!token) {
                                                  toast.error("You must be logged in to book.");
                                                  return;
                                              }
                                              try {
                                                  setIsBooking(true);
                                                  await shipmentsAPI.create({
                                                      prediction_id: predictionResult.id,
                                                      booking_id: `BK-${Date.now().toString().slice(-6)}`,
                                                      crop: predictionResult.crop,
                                                      tonnage: predictionResult.quantity_tons,
                                                      destination: fac.facility_name,
                                                      route_quality: predictionResult.road_condition,
                                                      eta_hours: (fac.physical_distance_km / 40).toFixed(1) + " hours",
                                                      risk_status: predictionResult.risk_level,
                                                      shelf_days_calculated: predictionResult.shelf_life_days,
                                                      vehicle_reg_number: bookingTarget
                                                  });
      
                                                  toast.success(`Slot successfully booked! Assigned Vehicle: ${bookingTarget}`);
                                                  setBookingDetails({
                                                      facilityName: fac.facility_name,
                                                      vehicleReg: bookingTarget
                                                  });
                                                  setIsBooking(false);
                                              } catch (error) {
                                                  console.error("Booking error:", error);
                                                  toast.error(error.message || "Failed to book shipment.");
                                                  setIsBooking(false);
                                              }
                                          }}
                                        >
                                          {isBooking ? t("Processing...") : "Yes, Confirm"}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button 
                                      type="button"
                                      disabled={isBooking}
                                      onClick={() => {
                                          let finalReg = vehicleReg.trim();
                                          if (bookingMode === 'manual') {
                                              if (!finalReg) {
                                                  toast.error("Please enter a vehicle registration number");
                                                  return;
                                              }
                                              const regRegex = /^KA\d{2}[A-Z]{2}\d{4}$/;
                                              if (!regRegex.test(finalReg)) {
                                                  toast.error("Format must be KA00XX0000 (e.g. KA01AB1234)");
                                                  return;
                                              }
                                          }
                                          if (bookingMode === 'random') {
                                              const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                                              const prefixNums = Math.floor(10 + Math.random() * 90).toString().padStart(2, '0');
                                              const r1 = letters[Math.floor(Math.random() * 26)];
                                              const r2 = letters[Math.floor(Math.random() * 26)];
                                              const rNums = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
                                              finalReg = `KA${prefixNums}${r1}${r2}${rNums}`;
                                              setVehicleReg(finalReg);
                                          }
                                          setBookingTarget(finalReg);
                                          setShowBookingConfirm(true);
                                      }}
                                      className="w-full bg-primary hover:bg-primary-hover py-3 shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {t("Confirm Booking")}
                                    </Button>
                                  )}
                                  </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Interactive Map */}
                  <div className="h-full min-h-[300px] rounded-xl overflow-hidden border border-white/10 relative z-0">
                    {predictionResult.f_lat && predictionResult.top_facilities && predictionResult.top_facilities[selectedFacilityIdx] ? (
                      <MapContainer 
                        bounds={[
                          [predictionResult.f_lat, predictionResult.f_lng],
                          [predictionResult.top_facilities[selectedFacilityIdx].latitude, predictionResult.top_facilities[selectedFacilityIdx].longitude]
                        ]}
                        zoom={8} 
                        scrollWheelZoom={false} 
                        style={{ height: '100%', width: '100%' }}
                        key={`map-${selectedFacilityIdx}`} // Force re-render on facility change to update bounds
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[predictionResult.f_lat, predictionResult.f_lng]}>
                          <Popup>Origin: {predictionResult.district}</Popup>
                        </Marker>
                        <Marker position={[predictionResult.top_facilities[selectedFacilityIdx].latitude, predictionResult.top_facilities[selectedFacilityIdx].longitude]}>
                          <Popup>Target: {predictionResult.top_facilities[selectedFacilityIdx].facility_name}</Popup>
                        </Marker>
                        <Polyline 
                          positions={[
                            [predictionResult.f_lat, predictionResult.f_lng],
                            [predictionResult.top_facilities[selectedFacilityIdx].latitude, predictionResult.top_facilities[selectedFacilityIdx].longitude]
                          ]} 
                          color="#10b981" 
                          weight={4} 
                          dashArray="10, 10" 
                        />
                      </MapContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-text-muted">Map data unavailable</div>
                    )}
                  </div>
                </div>
              </GlassCard>


            </>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl text-text-muted p-10 text-center">
              <Leaf size={48} className="text-primary/30 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Awaiting Parameters</h3>
              <p className="text-sm max-w-sm">Enter farm parameters, record a voice command, or upload a photo and click 'Analyze' to view the AI Risk Report.</p>
            </div>
          )}
        </div>
      </div>
      <ImageModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} imageSrc={modalImageSrc} />
    </div>
  );
};

export default Prediction;
