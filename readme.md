# JSDoc

Helper functions for working with JSDoc content

## Installation

```
npm install --save toptensoftware/jsdoc
```

## API

```js
// Strips all C/C++ style comments from a text string
export function stripComments(str);

// Parse a JSDoc parameter name of the form "name[.property=default]" etc...
export function parseParamName(t);

// Parses a JSDoc Block comment returning an array of block sections
// { 
//    block: string
//    text: string The text content of the block
// }
// 
// @param, @returns and @property will parse the {type} descriptor:
// {
//    type: string
// }
//
// @param and @property blocks will parse the name description:
// {
//    name: string (eg: "options")
//    specifier: string (eg: "options.subprop")
//    optional: boolean
//    default: string
// }
//
// @arg and @argument are remapped to @parameter
// @prop is remapped to @property
// @return is remapped to @returns
export function parseBlock(str);

// Given a JS doc string with embedded inline {@link} {@linkplain} or {@linkcode}
// directives, returns an array of link descriptors:
// {
//     pos: the position in the original string
//     end: the end position in the original string
//     kind: string "link", "linkplain" or "linkcode",
//     title: string | undefined
//     url: string | undefined url
//     namepath: a parse name path array
// }
export function parseInline(body);

// Parses the link descriptors in a string and returns
// {
//     body: string - original body string with link descriptors replaced with "{@link NN}" where
//                    NN is an index into links array
//     links: array of link descriptors
// }
export function replaceInline(body);

// Escape a path name element by wrapping in quotes
// if it contains special characters
export function escapeNamePathElement(name);

// Parse a name path into an array of descriptors
// { 
//     prefix: string or undefined (eg: "module:")
//     delimiter: string or undefined delimiter from previous element (eg: "#" or "." or "~")
//     name: string the name of the element (after unescaping, removing quoted etc)
// }
export function parseNamePath(t);

// Format an expanded name path array into a string
export function formatNamePath(np);
```


