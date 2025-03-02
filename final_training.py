import os
# Disable hf_transfer and use standard download instead
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '0'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '0'
# Long download timeout
os.environ['TRANSFORMERS_REQUEST_TIMEOUT'] = '500'

from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from datasets import load_dataset
from peft import get_peft_model, LoraConfig, TaskType, prepare_model_for_kbit_training
import torch
import time

# Use DeepSeek Coder V2 Lite Base model
model_name = "deepseek-ai/DeepSeek-Coder-V2-Lite-Base"
model_dir = "D:/projects/models/deepseek-ai/DeepSeek-Coder-V2-Lite-Base"  # Custom directory for downloaded model files
output_dir = "./finetuned-model"
training_file = "./training-data/edgeblocks_training-data.jsonl"
num_epochs = 5  # More epochs for small dataset
batch_size = 1
gradient_accumulation_steps = 4
learning_rate = 2e-4  # Higher learning rate for LoRA

print(f"Loading model from: {model_dir}")

# Function to load model and tokenizer from custom directory
def load_model_from_custom_dir():
    try:
        print("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            model_dir,
            trust_remote_code=True,
            local_files_only=True,  # Ensure no redownloading
        )
        print("Tokenizer loaded successfully")

        print("Loading model (this may take a while)...")
        model = AutoModelForCausalLM.from_pretrained(
            model_dir,
            trust_remote_code=True,
            device_map={"": "cpu"},  # Start on CPU to save memory
            torch_dtype=torch.float32,  # Use standard precision initially
            low_cpu_mem_usage=True,
            local_files_only=True,  # Ensure no redownloading
        )
        print("Model loaded successfully")
        return model, tokenizer
    except Exception as e:
        print(f"Failed to load model: {str(e)}")
        print(f"Please ensure the model files are correctly placed in: {model_dir}")
        exit(1)

# Load the model and tokenizer
try:
    model, tokenizer = load_model_from_custom_dir()
except Exception as e:
    print(f"Failed to load model after multiple attempts: {str(e)}")
    print("For direct download, visit: https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base")
    exit(1)

print(f"Loading dataset: {training_file}")
dataset = load_dataset('json', data_files=training_file)
print(f"Dataset loaded: {dataset}")

# Print a sample from the dataset
print("\nSample from dataset:")
print(dataset["train"][0])

# Configure LoRA
print("Configuring LoRA...")
# Prepare model for LoRA fine-tuning
model = prepare_model_for_kbit_training(model)

# Define LoRA configuration for DeepSeek Coder
lora_config = LoraConfig(
    r=8,  # Rank dimension
    lora_alpha=16,  # Alpha parameter for LoRA scaling
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # Attention module matrices 
    lora_dropout=0.05,  # Dropout probability for LoRA layers
    bias="none",  # Don't train bias parameters
    task_type=TaskType.CAUSAL_LM  # The task type (causal language modeling)
)

# Get LoRA model
model = get_peft_model(model, lora_config)
print("LoRA applied to model")

# Print trainable parameters
model.print_trainable_parameters()

# Tokenize the data
def tokenize_function(examples):
    # Tokenize the input text
    tokenized_inputs = tokenizer(
        examples["instruction"] if "instruction" in examples else examples["input"],
        padding="max_length",
        truncation=True,
        max_length=1024,
        return_tensors="pt",
    )
    
    # Use the input IDs as labels (shifted by one token for causal LM)
    tokenized_inputs["labels"] = tokenized_inputs["input_ids"].clone()
    
    return tokenized_inputs

print("Tokenizing dataset...")
tokenized_dataset = dataset.map(tokenize_function, batched=True)
print("Dataset tokenized")

# Find the latest checkpoint
import glob
checkpoints = sorted(glob.glob(f"{output_dir}/checkpoint-*"), key=os.path.getmtime)
if checkpoints:
    latest_checkpoint = checkpoints[-1]
    print(f"Resuming training from checkpoint: {latest_checkpoint}")
else:
    latest_checkpoint = None
    print("No checkpoints found. Starting training from scratch.")

# Set up training arguments
training_args = TrainingArguments(
    output_dir=output_dir,
    overwrite_output_dir=True,
    num_train_epochs=num_epochs,
    per_device_train_batch_size=batch_size,
    gradient_accumulation_steps=gradient_accumulation_steps,
    learning_rate=learning_rate,
    warmup_ratio=0.03,  # 3% of steps used for warmup
    logging_steps=1,
    save_steps=5,
    save_total_limit=3,
    fp16=False, 
    dataloader_drop_last=False,
    group_by_length=False,
    report_to="none",
    label_names=["input_ids"],  # Add this line
    resume_from_checkpoint=latest_checkpoint,  # Resume from the latest checkpoint
)

# Create a Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"],
)

# Start training
print("Starting training with LoRA...")
trainer.train()

# Save the model
print("Saving model...")
model.save_pretrained(output_dir)
tokenizer.save_pretrained(output_dir)
print(f"Training complete! Model saved to {output_dir}")
print("\nTo use this model:")
print("""
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel, PeftConfig

# Load the LoRA configuration
config = PeftConfig.from_pretrained("./finetuned-model")

# Load the base model
model = AutoModelForCausalLM.from_pretrained(
    config.base_model_name_or_path,
    trust_remote_code=True
)

# Load the fine-tuned LoRA weights
model = PeftModel.from_pretrained(model, "./finetuned-model")
tokenizer = AutoTokenizer.from_pretrained(config.base_model_name_or_path, trust_remote_code=True)

# Example usage
prompt = "Create a new EdgeBlocks component and call it: Button"
inputs = tokenizer(prompt, return_tensors="pt")
outputs = model.generate(**inputs, max_length=500)
print(tokenizer.decode(outputs[0]))
""")
