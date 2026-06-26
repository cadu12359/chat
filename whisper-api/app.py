"""
Whisper Transcription API
Serviço Flask mínimo que recebe arquivos de áudio e retorna a transcrição.
Usa faster-whisper com modelo 'small' em CPU (int8) para máxima eficiência.
"""

import os
import tempfile
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

app = Flask(__name__)

# ─── Carrega modelo uma vez na inicialização ──────────────
print("=" * 50)
print("  Carregando modelo Whisper 'small' (CPU, int8)...")
print("  (Primeiro uso baixa ~500 MB, depois usa cache)")
print("=" * 50)

model = WhisperModel("small", device="cpu", compute_type="int8")

print("=" * 50)
print("  ✅ Modelo Whisper pronto!")
print("=" * 50)


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Recebe um arquivo de áudio via multipart form-data e retorna a transcrição.

    Formatos aceitos: .mp3, .mp4, .wav, .m4a, .ogg, .webm
    Retorna JSON: { "text": "...", "language": "...", "duration": ... }
    """
    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado. Use o campo 'file'."}), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({"error": "Arquivo sem nome."}), 400

    # Salva em arquivo temporário mantendo a extensão original
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        # Transcreve com beam_size=5 para boa qualidade
        segments, info = model.transcribe(tmp_path, beam_size=5)
        text = " ".join(segment.text for segment in segments)

        return jsonify({
            "text": text.strip(),
            "language": info.language,
            "duration": round(info.duration, 2),
        })

    except Exception as e:
        return jsonify({"error": f"Erro na transcrição: {str(e)}"}), 500

    finally:
        # Sempre limpa o arquivo temporário
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000, debug=False)
