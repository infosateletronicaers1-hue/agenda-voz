import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Calendar, Clock, Trash2, Check, Bell, Plus } from 'lucide-react';

export default function AgendaVoz() {
  const [compromissos, setCompromissos] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [transcricao, setTranscricao] = useState('');
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [permissaoNotificacao, setPermissaoNotificacao] = useState(false);
  
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);

  // Carregar compromissos do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('compromissos-voz');
    if (saved) {
      setCompromissos(JSON.parse(saved));
    }

    // Pedir permissão para notificações
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        setPermissaoNotificacao(permission === 'granted');
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      setPermissaoNotificacao(true);
    }
  }, []);

  // Salvar compromissos no localStorage
  useEffect(() => {
    if (compromissos.length > 0) {
      localStorage.setItem('compromissos-voz', JSON.stringify(compromissos));
    }
  }, [compromissos]);

  // Verificar compromissos periodicamente
  useEffect(() => {
    const intervalo = setInterval(() => {
      verificarCompromissos();
    }, 30000); // Verifica a cada 30 segundos

    return () => clearInterval(intervalo);
  }, [compromissos]);

  const verificarCompromissos = () => {
    const agora = new Date();
    
    compromissos.forEach(comp => {
      if (comp.alertado) return;
      
      const horarioCompromisso = new Date(comp.horario);
      const antecedenciaMs = (comp.antecedencia || 15) * 60 * 1000;
      const horarioAlerta = new Date(horarioCompromisso.getTime() - antecedenciaMs);
      
      if (agora >= horarioAlerta && agora < horarioCompromisso) {
        dispararAlerta(comp);
        // Marcar como alertado
        setCompromissos(prev => prev.map(c => 
          c.id === comp.id ? { ...c, alertado: true } : c
        ));
      }
    });
  };

  const dispararAlerta = (compromisso) => {
    // Tocar som
    tocarAlertaSonoro();
    
    // Mostrar notificação
    if (permissaoNotificacao && 'Notification' in window) {
      const minutos = compromisso.antecedencia || 15;
      new Notification('🔔 Lembrete de Compromisso', {
        body: `${compromisso.descricao}\nEm ${minutos} minutos às ${formatarHora(compromisso.horario)}`,
        icon: '📅',
        requireInteraction: true
      });
    }
    
    // Vibrar (mobile)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  };

  const tocarAlertaSonoro = () => {
    // Criar tom de alerta usando Web Audio API
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
    
    // Segundo beep
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1000;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.5);
    }, 600);
  };

  const iniciarReconhecimento = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setMensagem('❌ Seu navegador não suporta reconhecimento de voz');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscricao('');
      setMensagem('🎤 Escutando... Diga seu compromisso!');
    };

    recognition.onresult = (event) => {
      const texto = event.results[0][0].transcript;
      setTranscricao(texto);
      processarComando(texto);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setMensagem(`❌ Erro: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const pararReconhecimento = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const processarComando = async (texto) => {
    setProcessando(true);
    setMensagem('🤔 Processando seu compromisso...');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Extraia as informações deste compromisso falado em português:
"${texto}"

Retorne APENAS um JSON com esta estrutura (sem markdown, sem explicações):
{
  "descricao": "descrição do compromisso",
  "horario": "YYYY-MM-DDTHH:MM:SS",
  "antecedencia": número_de_minutos_antes
}

Regras:
- Se não houver data específica, use hoje
- Se não houver horário específico, use uma estimativa razoável
- antecedencia padrão é 15 minutos se não especificado
- Use o fuso horário de Brasília (GMT-3)
- Data atual: ${new Date().toISOString()}`
          }]
        })
      });

      const data = await response.json();
      const textoResposta = data.content.find(c => c.type === 'text')?.text || '';
      
      // Remover possíveis marcações markdown
      const jsonLimpo = textoResposta.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const compromissoData = JSON.parse(jsonLimpo);

      const novoCompromisso = {
        id: Date.now(),
        descricao: compromissoData.descricao,
        horario: compromissoData.horario,
        antecedencia: compromissoData.antecedencia || 15,
        alertado: false,
        criadoEm: new Date().toISOString()
      };

      setCompromissos(prev => [...prev, novoCompromisso]);
      setMensagem(`✅ Compromisso adicionado! Lembrete ${novoCompromisso.antecedencia} min antes.`);
      setTranscricao('');
      
    } catch (error) {
      console.error('Erro ao processar:', error);
      setMensagem('❌ Erro ao processar. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  };

  const removerCompromisso = (id) => {
    setCompromissos(prev => prev.filter(c => c.id !== id));
    setMensagem('🗑️ Compromisso removido');
  };

  const formatarHora = (horario) => {
    return new Date(horario).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatarData = (horario) => {
    const data = new Date(horario);
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    if (data.toDateString() === hoje.toDateString()) {
      return 'Hoje';
    } else if (data.toDateString() === amanha.toDateString()) {
      return 'Amanhã';
    } else {
      return data.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit' 
      });
    }
  };

  const compromissosOrdenados = [...compromissos].sort((a, b) => 
    new Date(a.horario) - new Date(b.horario)
  );

  return (
    <div className="app-container">
      <div className="header">
        <div className="header-content">
          <h1 className="title">
            <Calendar className="title-icon" />
            Minha Agenda
          </h1>
          <p className="subtitle">Comandos de voz • Alertas sonoros</p>
        </div>
      </div>

      <div className="main-content">
        {/* Botão de Voz */}
        <div className="voice-section">
          <button
            className={`voice-button ${isListening ? 'listening' : ''}`}
            onClick={isListening ? pararReconhecimento : iniciarReconhecimento}
            disabled={processando}
          >
            {isListening ? (
              <>
                <MicOff size={32} />
                <span className="pulse"></span>
              </>
            ) : (
              <Mic size={32} />
            )}
          </button>
          
          <p className="voice-hint">
            {isListening ? 'Clique para parar' : 'Clique para falar'}
          </p>

          {transcricao && (
            <div className="transcricao">
              <p>📝 "{transcricao}"</p>
            </div>
          )}

          {mensagem && (
            <div className={`mensagem ${mensagem.includes('✅') ? 'sucesso' : mensagem.includes('❌') ? 'erro' : 'info'}`}>
              {mensagem}
            </div>
          )}
        </div>

        {/* Dicas de Uso */}
        {compromissos.length === 0 && (
          <div className="dicas">
            <h3>💡 Como usar:</h3>
            <ul>
              <li>"Tenho que atender um cliente às 14h"</li>
              <li>"Buscar a filha na escola às 17h30"</li>
              <li>"Reunião amanhã às 10h, me lembre 30 minutos antes"</li>
              <li>"Ligar para o dentista hoje às 15h"</li>
            </ul>
          </div>
        )}

        {/* Lista de Compromissos */}
        <div className="compromissos-lista">
          <h2 className="section-title">
            <Clock size={20} />
            Próximos Compromissos ({compromissos.length})
          </h2>
          
          {compromissosOrdenados.map((comp, index) => (
            <div key={comp.id} className="compromisso-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="compromisso-header">
                <div className="compromisso-data">
                  <span className="data-badge">{formatarData(comp.horario)}</span>
                  <span className="hora-badge">{formatarHora(comp.horario)}</span>
                </div>
                <button 
                  className="btn-remover"
                  onClick={() => removerCompromisso(comp.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              
              <p className="compromisso-descricao">{comp.descricao}</p>
              
              <div className="compromisso-footer">
                <span className="alerta-info">
                  <Bell size={14} />
                  Alerta {comp.antecedencia} min antes
                </span>
                {comp.alertado && (
                  <span className="alertado-badge">
                    <Check size={14} />
                    Alertado
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Righteous&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .app-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: 'Poppins', sans-serif;
          color: white;
          overflow-x: hidden;
        }

        .header {
          background: rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(10px);
          padding: 1.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .header-content {
          max-width: 600px;
          margin: 0 auto;
        }

        .title {
          font-family: 'Righteous', cursive;
          font-size: 2rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
          animation: slideInDown 0.6s ease-out;
        }

        .title-icon {
          animation: rotate 2s ease-in-out infinite;
        }

        @keyframes rotate {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(10deg); }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .subtitle {
          font-size: 0.9rem;
          opacity: 0.9;
          animation: fadeIn 1s ease-out 0.3s both;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }

        .voice-section {
          text-align: center;
          margin-bottom: 2rem;
          animation: fadeIn 0.8s ease-out 0.4s both;
        }

        .voice-button {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
          box-shadow: 0 10px 30px rgba(245, 87, 108, 0.4);
          transition: all 0.3s ease;
          position: relative;
        }

        .voice-button:hover {
          transform: scale(1.05);
          box-shadow: 0 15px 40px rgba(245, 87, 108, 0.6);
        }

        .voice-button:active {
          transform: scale(0.95);
        }

        .voice-button.listening {
          background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 10px 30px rgba(250, 112, 154, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 15px 50px rgba(250, 112, 154, 0.7); }
        }

        .pulse {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          animation: pulseRing 1.5s ease-out infinite;
        }

        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }

        .voice-hint {
          font-size: 0.9rem;
          opacity: 0.9;
          margin-bottom: 1rem;
        }

        .transcricao {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          padding: 1rem;
          border-radius: 12px;
          margin-bottom: 1rem;
          animation: slideInUp 0.4s ease-out;
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .mensagem {
          padding: 1rem;
          border-radius: 12px;
          margin-bottom: 1rem;
          animation: slideInUp 0.4s ease-out;
          font-weight: 500;
        }

        .mensagem.sucesso {
          background: rgba(76, 217, 100, 0.2);
          border: 2px solid rgba(76, 217, 100, 0.4);
        }

        .mensagem.erro {
          background: rgba(255, 59, 48, 0.2);
          border: 2px solid rgba(255, 59, 48, 0.4);
        }

        .mensagem.info {
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .dicas {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 1.5rem;
          border-radius: 16px;
          margin-bottom: 2rem;
          animation: fadeIn 1s ease-out 0.6s both;
        }

        .dicas h3 {
          margin-bottom: 1rem;
          font-size: 1.1rem;
        }

        .dicas ul {
          list-style: none;
        }

        .dicas li {
          padding: 0.5rem 0;
          padding-left: 1.5rem;
          position: relative;
        }

        .dicas li:before {
          content: '🎙️';
          position: absolute;
          left: 0;
        }

        .compromissos-lista {
          animation: fadeIn 0.8s ease-out 0.8s both;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          font-size: 1.3rem;
          font-weight: 600;
        }

        .compromisso-card {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          padding: 1.5rem;
          border-radius: 16px;
          margin-bottom: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          animation: slideInUp 0.5s ease-out both;
          transition: all 0.3s ease;
        }

        .compromisso-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
          background: rgba(255, 255, 255, 0.2);
        }

        .compromisso-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .compromisso-data {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .data-badge, .hora-badge {
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .data-badge {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .hora-badge {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .btn-remover {
          background: rgba(255, 59, 48, 0.2);
          border: none;
          color: white;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-remover:hover {
          background: rgba(255, 59, 48, 0.4);
          transform: scale(1.1);
        }

        .compromisso-descricao {
          font-size: 1.05rem;
          line-height: 1.5;
          margin-bottom: 1rem;
        }

        .compromisso-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          opacity: 0.9;
        }

        .alerta-info {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .alertado-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(76, 217, 100, 0.3);
          padding: 0.3rem 0.7rem;
          border-radius: 12px;
          font-weight: 500;
        }

        @media (max-width: 480px) {
          .title {
            font-size: 1.5rem;
          }

          .voice-button {
            width: 100px;
            height: 100px;
          }

          .compromisso-card {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
