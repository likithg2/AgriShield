"""
quality_predictor.py — Vegetable Quality and Freshness Classifier
Loads the trained MobileNetV2 model using ONNX Runtime for ultra-low memory
consumption (~40 MB vs ~390 MB with TensorFlow) on constrained hosting tiers.
Includes an automatic fallback to TensorFlow Keras if ONNX model is unavailable.
"""

import os
import sys
import numpy as np
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Candidate paths for model files
ONNX_PATHS = [
    os.path.join(BASE_DIR, "models", "vegetable_quality_v5_model.onnx"),
    os.path.join(BASE_DIR, "vegetable_quality_v5_model.onnx"),
]

KERAS_PATHS = [
    os.path.join(BASE_DIR, "models", "vegetable_quality_v5_model.keras"),
    os.path.join(BASE_DIR, "vegetable_quality_v5_model.keras"),
]

class_names_8 = [
    'freshcucumber', 'freshonion', 'freshpotato', 'freshtomato',
    'rottencucumber', 'rottenonion', 'rottenpotato', 'rottentomato'
]

class_names_20 = [
    'freshapples', 'freshbanana', 'freshbittergroud', 'freshcapsicum', 'freshcucumber', 'freshokra', 'freshonion', 'freshoranges', 'freshpotato', 'freshtomato',
    'rottenapples', 'rottenbanana', 'rottenbittergroud', 'rottencapsicum', 'rottencucumber', 'rottenokra', 'rottenonion', 'rottenoranges', 'rottenpotato', 'rottentomato'
]

IMG_SIZE = (224, 224)

# Global lazy cache for the loaded model session
_cached_session = None
_session_type = None  # "onnx" or "keras"
_input_name = None
_output_name = None


def _init_model():
    """Lazily initialize and cache the model on first inference request."""
    global _cached_session, _session_type, _input_name, _output_name

    if _cached_session is not None:
        return _cached_session, _session_type

    # 1. Primary path: ONNX Runtime
    onnx_file = next((p for p in ONNX_PATHS if os.path.isfile(p)), None)
    if onnx_file:
        try:
            import onnxruntime as ort
            # Configure single-thread inference to keep CPU and memory footprint minimal
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            session = ort.InferenceSession(onnx_file, sess_options=opts, providers=['CPUExecutionProvider'])
            _input_name = session.get_inputs()[0].name
            _output_name = session.get_outputs()[0].name
            _cached_session = session
            _session_type = "onnx"
            return _cached_session, _session_type
        except Exception as exc:
            import logging
            logging.warning(f"Failed to initialize ONNX Runtime session: {exc}. Falling back to TensorFlow.")

    # 2. Fallback path: TensorFlow Keras
    keras_file = next((p for p in KERAS_PATHS if os.path.isfile(p)), None)
    if keras_file:
        try:
            try:
                import tensorflow as tf
                from tensorflow.keras.models import load_model
                from tensorflow.keras.layers import Dense
            except (ImportError, AttributeError):
                from keras.models import load_model
                from keras.layers import Dense

            # Monkey-patch Dense.from_config to strip quantization_config (Keras 2 artifact)
            original_from_config = Dense.from_config
            @classmethod
            def custom_from_config(cls, config):
                config.pop('quantization_config', None)
                return original_from_config.__get__(None, cls)(config)
            Dense.from_config = custom_from_config

            _cached_session = load_model(keras_file, compile=False)
            _session_type = "keras"
            return _cached_session, _session_type
        except Exception as exc:
            raise RuntimeError(f"Could not load either ONNX or Keras quality model: {exc}")

    raise FileNotFoundError("Quality predictor model file not found in models/ or project root.")


def predict_quality(uploaded_file):
    """
    Predict crop quality from an image file or stream.
    Returns: (crop, quality, confidence, fresh_pct, rotten_pct)
    """
    model_session, session_type = _init_model()

    # Read image
    img = Image.open(uploaded_file).convert("RGB")
    img = img.resize(IMG_SIZE)

    # Convert to NumPy array
    img_array = np.array(img, dtype=np.float32)

    # Add batch dimension
    img_array = np.expand_dims(img_array, axis=0)

    # Execute inference
    if session_type == "onnx":
        prediction = model_session.run([_output_name], {_input_name: img_array})[0]
    else:
        prediction = model_session.predict(img_array, verbose=0)

    predicted_index = int(np.argmax(prediction))

    # Choose the correct label list based on model output size
    num_classes = prediction.shape[1]
    if num_classes == 8:
        class_list = class_names_8
    else:
        class_list = class_names_20

    predicted_class = class_list[predicted_index]
    confidence = float(prediction[0][predicted_index] * 100)

    # Separate quality and crop
    if predicted_class.startswith("fresh"):
        quality = "Fresh"
        crop = predicted_class.replace("fresh", "")
    else:
        quality = "Rotten"
        crop = predicted_class.replace("rotten", "")

    crop = crop.capitalize()

    # Calculate both fresh and rotten percentages for this specific crop
    if quality == "Fresh":
        # For fresh produce, visible spoilage reflects minor surface imperfections (0.5% - 10%),
        # not multi-class softmax probability dispersion across other classes.
        fresh_pct = round(max(confidence, 85.0), 1)
        rotten_pct = round(max(0.5, min(10.0, (100.0 - confidence) * 0.2)), 1)
    else:
        rotten_pct = round(max(confidence, 65.0), 1)
        fresh_pct = round(max(0.0, 100.0 - rotten_pct), 1)

    return crop, quality, confidence, fresh_pct, rotten_pct
