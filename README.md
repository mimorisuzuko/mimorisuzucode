# Mimori Suzu Code

Mimori Suzu Code is a new type of editor that allows user to create Tweet like [@mimori_suzuko](https://twitter.com/mimori_suzuko).

![](demo.gif)

## Requirements

Electron v1.4.0

## Usage

```
git clone https://github.com/mimorisuzuko/mimorisuzucode.git
```

### Preparation

Create the file `config.json` as below.

```
{
	"consumerKey": "xxxx",
	"consumerSecret": "xxxx",
	"accessToken": "xxxx",
	"accessTokenSecret": "xxxx"
}
```

### Start Code

```
npm start
```

### Routine

1. Open a directory `⌘+O`
2. Select a file from the directory tree
3. Edit the file
4. Tweet the file content by clicking Twitter bird from navigation bar