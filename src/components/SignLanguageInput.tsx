import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, Check, RefreshCw, Hand, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Declare globals from CDN
declare global {
  interface Window {
    handpose: any;
    fp: any;
    tf: any;
  }
}

interface SignLanguageInputProps {
  onInput: (text: string) => void;
  onClose: () => void;
  theme: 'dark' | 'light';
}

const SignLanguageInput: React.FC<SignLanguageInputProps> = ({ onInput, onClose, theme }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detectedSign, setDetectedSign] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<string>('');
  const [confidence, setConfidence] = useState(0);

  // Initialize Gesture Estimator
  const [estimator, setEstimator] = useState<any>(null);

  useEffect(() => {
    const loadModel = async () => {
      try {
        setLoading(true);
        // Wait for scripts to load
        while (!window.handpose || !window.fp) {
          await new Promise(r => setTimeout(r, 100));
        }

        const loadedModel = await window.handpose.load();
        setModel(loadedModel);
        
        // Define Gestures with more lenient rules for better detection
        const fp = window.fp;
        const GE = new fp.GestureEstimator([
            createGesture(fp, 'A', [
                [fp.Finger.Thumb, fp.FingerCurl.NoCurl],
                [fp.Finger.Index, fp.FingerCurl.FullCurl],
                [fp.Finger.Middle, fp.FingerCurl.FullCurl],
                [fp.Finger.Ring, fp.FingerCurl.FullCurl],
                [fp.Finger.Pinky, fp.FingerCurl.FullCurl]
            ]),
            createGesture(fp, 'B', [
                [fp.Finger.Thumb, fp.FingerCurl.HalfCurl],
                [fp.Finger.Index, fp.FingerCurl.NoCurl],
                [fp.Finger.Middle, fp.FingerCurl.NoCurl],
                [fp.Finger.Ring, fp.FingerCurl.NoCurl],
                [fp.Finger.Pinky, fp.FingerCurl.NoCurl]
            ]),
            createGesture(fp, 'QUIZ', [ // 1 Finger: Index up (Pointing up)
                [fp.Finger.Index, fp.FingerCurl.NoCurl],
                [fp.Finger.Middle, fp.FingerCurl.FullCurl],
                [fp.Finger.Ring, fp.FingerCurl.FullCurl],
                [fp.Finger.Pinky, fp.FingerCurl.FullCurl],
                [fp.Finger.Thumb, fp.FingerCurl.HalfCurl]
            ]),
            createGesture(fp, 'SUMMARY', [ // 2 Fingers: Index and Middle up (V Sign)
                [fp.Finger.Index, fp.FingerCurl.NoCurl],
                [fp.Finger.Middle, fp.FingerCurl.NoCurl],
                [fp.Finger.Ring, fp.FingerCurl.FullCurl],
                [fp.Finger.Pinky, fp.FingerCurl.FullCurl],
                [fp.Finger.Thumb, fp.FingerCurl.HalfCurl]
            ]),
            createGesture(fp, 'FLASHCARDS', [ // 3 Fingers (W Sign)
                [fp.Finger.Index, fp.FingerCurl.NoCurl],
                [fp.Finger.Middle, fp.FingerCurl.NoCurl],
                [fp.Finger.Ring, fp.FingerCurl.NoCurl],
                [fp.Finger.Pinky, fp.FingerCurl.FullCurl],
                [fp.Finger.Thumb, fp.FingerCurl.HalfCurl]
            ]),
            createGesture(fp, '👋', [ // Hello (Open Hand)
                [fp.Finger.Index, fp.FingerCurl.NoCurl],
                [fp.Finger.Middle, fp.FingerCurl.NoCurl],
                [fp.Finger.Ring, fp.FingerCurl.NoCurl],
                [fp.Finger.Pinky, fp.FingerCurl.NoCurl],
                [fp.Finger.Thumb, fp.FingerCurl.NoCurl]
            ]),
            createGesture(fp, '👍', [ // Thumb Up
                [fp.Finger.Thumb, fp.FingerCurl.NoCurl],
                [fp.Finger.Index, fp.FingerCurl.FullCurl],
                [fp.Finger.Middle, fp.FingerCurl.FullCurl],
                [fp.Finger.Ring, fp.FingerCurl.FullCurl],
                [fp.Finger.Pinky, fp.FingerCurl.FullCurl]
            ]),
            createGesture(fp, '👎', [ // Thumb Down
                [fp.Finger.Thumb, fp.FingerCurl.NoCurl],
                [fp.Finger.Index, fp.FingerCurl.FullCurl],
                [fp.Finger.Middle, fp.FingerCurl.FullCurl],
                [fp.Finger.Ring, fp.FingerCurl.FullCurl],
                [fp.Finger.Pinky, fp.FingerCurl.FullCurl]
            ]),
        ]);
        setEstimator(GE);

        setLoading(false);
      } catch (err) {
        console.error("Failed to load Handpose/Fingerpose", err);
      }
    };
    loadModel();
  }, []);

  const createGesture = (fp: any, name: string, rules: any[]) => {
      const gesture = new fp.GestureDescription(name);
      rules.forEach(([finger, curl, dir]) => {
          gesture.addCurl(finger, curl, 1.0);
          if (dir) gesture.addDirection(finger, dir, 1.0);
      });
      return gesture;
  };

  const detect = useCallback(async () => {
    if (
      typeof videoRef.current !== "undefined" &&
      videoRef.current !== null &&
      videoRef.current.readyState === 4 &&
      model &&
      estimator
    ) {
      const video = videoRef.current;
      const predictions = await model.estimateHands(video);

      if (predictions.length > 0) {
        // Draw landmarks
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && canvasRef.current) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
            ctx.clearRect(0, 0, video.videoWidth, video.videoHeight);
            drawHand(predictions, ctx);
        }

        // Estimate Gesture - Using a lower threshold for better reactivity (6.0 instead of 7.5)
        const est = await estimator.estimate(predictions[0].landmarks, 6.0);
        if (est.gestures.length > 0) {
          const best = est.gestures.reduce((p: any, c: any) => p.confidence > c.confidence ? p : c);
          if (best.confidence > 6.5) { // Lowered from 8.0
              setDetectedSign(best.name);
              setConfidence(best.confidence);
          } else {
              setDetectedSign(null);
          }
        }
      } else {
          setDetectedSign(null);
      }
    }
  }, [model, estimator]);

  useEffect(() => {
    const interval = setInterval(() => {
        detect();
    }, 100); // 10 FPS
    return () => clearInterval(interval);
  }, [detect]);

  // Lock-in Mechanism: If sign is held for 1s
  const [holdTimer, setHoldTimer] = useState<number>(0);
  const lastSignRef = useRef<string | null>(null);

  useEffect(() => {
      if (detectedSign && detectedSign === lastSignRef.current) {
          const timer = setTimeout(() => {
             // Confirm sign
             if (detectedSign === '👋') onInput("Hello ");
             else if (detectedSign === '👍') onInput("Yes ");
             else if (detectedSign === '👎') onInput("No ");
             else if (detectedSign === 'SPACE') onInput(" ");
             else if (detectedSign === 'BACK') onInput("\b");
             else if (detectedSign === 'QUIZ') onInput("[GENERATE_QUIZ]");
             else if (detectedSign === 'SUMMARY') onInput("[GENERATE_SUMMARY]");
             else if (detectedSign === 'FLASHCARDS') onInput("[GENERATE_FLASHCARDS]");
             else onInput(detectedSign);
             
             // Visual Feedback
             setBuffer(prev => {
                 if (detectedSign === 'BACK') return prev.slice(0, -1);
                 if (detectedSign === 'SPACE') return prev + ' ';
                 if (['QUIZ', 'SUMMARY', 'FLASHCARDS'].includes(detectedSign!)) return prev + `\n[${detectedSign}] `;
                 return prev + detectedSign;
             });
             setDetectedSign(null); // Reset to force re-detection (debounce)
             lastSignRef.current = null;
          }, 1000);
          return () => clearTimeout(timer);
      } else {
          lastSignRef.current = detectedSign;
      }
  }, [detectedSign, onInput]);


  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480, facingMode: "user" } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        console.error("Camera access failed", err);
      }
    };
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const drawHand = (predictions: any, ctx: CanvasRenderingContext2D) => {
    predictions.forEach((prediction: any) => {
      const landmarks = prediction.landmarks;
      
      // Draw Connections (Bones)
      const fingerJoints: { [key: string]: number[] } = {
        thumb: [0, 1, 2, 3, 4],
        indexFinger: [0, 5, 6, 7, 8],
        middleFinger: [0, 9, 10, 11, 12],
        ringFinger: [0, 13, 14, 15, 16],
        pinky: [0, 17, 18, 19, 20],
      };

      Object.values(fingerJoints).forEach(jointIndices => {
        for (let k = 0; k < jointIndices.length - 1; k++) {
          const firstJointIndex = jointIndices[k];
          const secondJointIndex = jointIndices[k + 1];
          ctx.beginPath();
          ctx.moveTo(landmarks[firstJointIndex][0], landmarks[firstJointIndex][1]);
          ctx.lineTo(landmarks[secondJointIndex][0], landmarks[secondJointIndex][1]);
          ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Draw Joints
      for (let j = 0; j < landmarks.length; j++) {
        const x = landmarks[j][0];
        const y = landmarks[j][1];
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 3 * Math.PI);
        ctx.fillStyle = theme === 'dark' ? "#3b82f6" : "#6366f1";
        ctx.fill();
      }
    });
  };

  return (
    <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`fixed bottom-32 right-8 z-[200] w-96 rounded-[3rem] overflow-hidden border-4 shadow-2xl ${
            theme === 'dark' ? 'bg-[#0D0D0D] border-blue-500/30' : 'bg-white border-blue-200'
        }`}
    >
        <div className="relative aspect-[3/4] bg-black">
            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-blue-500 z-20">
                    <Loader className="animate-spin mb-4" size={32} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Loading Neural Vision</span>
                </div>
            )}
            
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover opacity-80"
                autoPlay
                playsInline
                muted
                onLoadedData={() => {
                    if (videoRef.current) {
                        videoRef.current.width = videoRef.current.videoWidth;
                        videoRef.current.height = videoRef.current.videoHeight;
                    }
                }}
            />
            
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10" />

            {/* Gesture Legend with Bot Stickers */}
            <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
                {[
                    { name: 'QUIZ (1)', icon: '📝', color: 'bg-amber-500' },
                    { name: 'SUMMARY (2)', icon: '📄', color: 'bg-purple-500' },
                    { name: 'FLASHCARDS (3)', icon: '🎴', color: 'bg-emerald-500' }
                ].map(item => (
                    <div key={item.name} className="flex items-center gap-2 bg-black/60 backdrop-blur-md p-2 rounded-xl border border-white/10">
                        <div className={`w-6 h-6 rounded-lg ${item.color} flex items-center justify-center text-[10px]`}>
                            <RefreshCw size={10} className="text-white animate-spin-slow" />
                        </div>
                        <span className="text-[8px] font-black text-white uppercase tracking-tighter">{item.name}</span>
                        <span className="text-xs">{item.icon}</span>
                    </div>
                ))}
            </div>

            {/* Overlay UI */}
            <div className="absolute top-4 right-4 z-30">
                <button onClick={onClose} className="p-2 bg-black/50 text-white rounded-full hover:bg-red-500/80 transition-colors">
                    <X size={16} />
                </button>
            </div>

            <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent z-30">
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1">Detected Sign</p>
                        <h3 className="text-4xl font-black italic text-white uppercase">{detectedSign || '...'}</h3>
                    </div>
                    {detectedSign && (
                        <motion.div 
                            initial={{ scale: 0 }} 
                            animate={{ scale: 1 }} 
                            className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white"
                        >
                            <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" style={{ animationDuration: '1s' }} />
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
        
        <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Hand size={16} />
                <span className="text-[9px] font-black uppercase tracking-widest">Neural Command Active</span>
            </div>
            {buffer && (
                <button onClick={() => setBuffer('')} className="text-[9px] font-black uppercase opacity-60 hover:opacity-100">
                    Clear Buffer
                </button>
            )}
        </div>
    </motion.div>
  );
};

export default SignLanguageInput;
