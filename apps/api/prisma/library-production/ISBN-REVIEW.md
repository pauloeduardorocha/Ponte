# Pesquisa de ISBNs antes de associar capas

Piloto de 20 registos do acervo, com títulos brasileiros e de outras línguas.
A pesquisa assistida consulta metadados de editoras, livrarias, Google Books
(páginas públicas), Open Library e bibliografias nacionais. Não se exige chave.

`isbn-pilot-evidence.json` guarda os candidatos, as fontes, os dados de edição e
as ressalvas. Não é resultado de um varrimento automático de ISBNs encontrados
em qualquer página: cada entrada foi associada ao registo após pesquisa de título
e autoria. `prepare_isbn_review.py` valida a estrutura e os dígitos verificadores
dos ISBNs e gera o CSV. A verificação matemática não confirma a identidade da
obra, nem a edição física, nem corrige metadados da fonte.

```powershell
python -B prepare_isbn_review.py --input openlibrary-pilot-20.json --evidence isbn-pilot-evidence.json --output isbn-para-revisao.csv
python -B -m unittest discover -s . -p test_isbn_review.py -v
```

Python 3.10+, sem dependências externas. Executar na pasta deste script ou ajustar
os caminhos. A saída é criada exclusivamente, sem sobrescrever um CSV anterior.
Não há ligação ao banco nem aplicação automática de ISBN, língua, editora ou capa.

Resultado da pesquisa de 22/10/2026: 16 registos com candidatos (18 fichas de
edições), 4 pendentes. Isso inclui um possível box de Evangelhos para todos;
não se pode concluir que o ISBN do conjunto corresponda ao exemplar do acervo.
Também há fichas comunitárias e uma ficha de Teologia Sistemática com dados
editoriais divergentes. Os candidatos não têm todos o mesmo grau de sustentação.

O CSV mantém o título e autor originais separados dos encontrados, registos com
zeros, fonte, língua, editora, ano/formato quando informados e observações.
ISBN-10 é convertido no equivalente ISBN-13 apenas após validar o dígito. ISBNs
de outras edições ficam em linhas separadas. Não se atribui um idioma único ao
acervo nem se deduz Brasil/Portugal apenas pelo texto português.

Etapas seguintes: conferir edição, formato e editora de cada exemplar; resolver
box versus volume; confirmar correções de autores; só então aprovar os ISBNs e
procurar as capas dessa edição. Capas e ISBNs não são campos universais da obra:
traduções, novas edições e formatos podem ter identificadores diferentes.
