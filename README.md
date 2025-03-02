## all commands to be ran from within trainer folder

# place code to train on in ./raw-source-code

- node setup.js
- node data-processor.js

# when processing is finished

- ./train.sh

# when trainig is finished

- update Modelfile if needed
- ollama create my-finetuned-model -f ./Modelfile
- ollama run my-finetuned-model
