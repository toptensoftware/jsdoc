import { strangle, find_bol, find_eol, find_bol_ws, find_eol_ws, skip_eol } from "@toptensoftware/strangle";
import { unindent } from "@toptensoftware/unindent";

// Strips all C/C++ style comments from a text string
export function stripComments(str)
{
    let rx = /(?:(?:\/\*[\s\S]*?\*\/)|(?:\/\/.*?)(?=[\r\n]))/g
    let match;
    let ranges = [];
    while (match = rx.exec(str))
    {
        ranges.unshift({ pos: match.index, end: rx.lastIndex });
    }
    for (let r of ranges)
    {
        let pos = find_bol_ws(str, r.pos);
        let end = find_eol_ws(str, r.end);
        if (pos == find_bol(str, r.pos) && end == find_eol(str, r.end))
            end = skip_eol(str, end);
        str = str.substring(0, pos) + str.substring(end);
    }
    return str;
}



// Parse a JSDoc parameter name of the form "name[.property=default]" etc...
export function parseParamName(t)
{
    t.readWhitespace();

    let optional = !!t.read("[");
    let start = t.pos;

    t.readWhitespace();
    let name = t.readIdentifier();
    if (!name)
        return undefined;

    while (true)
    {
        t.readWhitespace();

        if (t.read("["))
        {
            t.readWhitespace();
            if (!t.read("]"))
                return undefined;
            continue;
        }
        if (t.read("."))
        {
            t.readWhitespace();
            if (!t.readIdentifier())
                return undefined;
            continue;
        }

        break;
    }

    let result = {
        optional,
        name: name,
        specifier: t.substring(start, t.pos).trim(),
    }


    if (optional)
    {
        t.readWhitespace();
        if (t.read("="))
        {
            t.readWhitespace();

            let defStart = t.pos;
            while (t.current != ']')
            {
                if (t.eof)
                    return undefined;
                if (!t.readNested())
                    t.readChar();
            }
            result.default = t.substring(defStart, t.pos);
        }

        if (!t.read("]"))
            return undefined;
    }

    return result;
}

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
export function parseBlock(str)
{
    str = unindent(str);
    
    let end = str.match(/(?:(?:^\s*\*\/)|(?:\*\/))/m);
    if (end < 0)
        return undefined;

    // Create strangle
    let t = strangle(str.substring(0, end.index));

    // Skip whitespace
    t.readWhitespace();

    // Skip opening comment
    if (!t.read(/\/\*\* ?/y))
        return null;

    let section = {
        kind: null,
        text: "",
    }
    let sections = [ section ];
    while (!t.eof)
    {
        // Read a line
        section.text += t.readToNextLine();

        // Skip leading *
        t.read(/\s*\* ?/y);

        // Is it a directive?
        let directive = t.read(/\s*@([a-zA-Z][a-zA-Z0-9_$]*) ?/y);
        if (directive)
        {
            t.readWhitespace();

            // Create a new section
            section = {
                block: directive[1],
                text: "",
            };
            sections.push(section);

            // Alias
            if (section.block == 'arg' || section.block == 'argument')
                section.block = "param";
            if (section.block == 'prop')
                section.block = "parameter";
            if (section.block == "return")
                section.block = "returns";

            // Does it have a type specifier 
            if (section.block.match(/param|returns|property/))
            {
                if (t.current == '{')
                {
                    let type = t.readNested();
                    if (!type)
                    {
                        let err = new Error("syntax error parsing JSDoc - missing '}'")
                        err.offset = t.pos;
                        throw err;
                    }
                    section.type = type.substring(1, type.length - 1);
                    t.readWhitespace();
                }
            }

            // Does it have a name
            if (section.block.match(/param|property/))
            {
                Object.assign(section, parseParamName(t));
                t.readWhitespace();
            }
        }
    }

//    console.log(JSON.stringify(sections, null, 2));
    return sections;
}


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
export function parseInline(body)
{
    let t = strangle(body);

    let links = [];

    // {@
    while (t.find(/\{@/g))
    {
        let linkPos = t.pos;

        t.pos += 2;

        // link | linkplain | linkcode
        let kind = t.read(/link|linkplain|linkcode\b/y);
        if (!kind)
            continue;
        kind = kind[0];

        // Whitespace
        t.readWhitespace();

        // Try to parse as a namepath
        let url = undefined;
        let namepath = parseNamePath(t);
        if (!namepath)
        {
            url = t.read(/[^ \t\}\|]+/y);
            if (!url)
                continue;
            url = url[0];
        }

        // Skip optional separator
        t.readWhitespace();
        if (t.current == '|')
            t.pos++;
        t.readWhitespace();

        // Read title
        let title = t.read(/[^\}]*/y);
        if (title)
            title = title[0].trim();
        if (title.length == 0)
            title = undefined;

        // Skip delimiter
        if (t.current != '}')
            continue;
        t.pos++;

        // Store link
        links.push({
            pos: linkPos,
            end: t.pos,
            kind,
            title,
            url,
            namepath,
        });
    }

    return links;
}

// Parses the link descriptors in a string and returns
// {
//     body: string - original body string with link descriptors replaced with "{@link NN}" where
//                    NN is an index into links array
//     links: array of link descriptors
// }
export function replaceInline(body)
{
    let links = parseInline(body);
    let buf = "";
    let pos = 0;
    for (let i=0; i<links.length; i++)
    {
        let l = links[i];
        if (l.pos > pos)
            buf += body.substring(pos, l.pos);

        buf += `{@link ${i}}`;
        pos = l.end;
    }
    buf += body.substring(pos);

    return {
        body: buf,
        links,
    }
}


// Escape a path name element by wrapping in quotes
// if it contains special characters
export function escapeNamePathElement(name)
{
    // Does it have special characters
    if (!name.match(/[^a-zA-Z0-9_$@/]/))
        return name;

    return `"${name.replace(/"/g, "\\\"")}\"`;
}


// Parse a name path into an array of descriptors
// { 
//     prefix: string or undefined (eg: "module:")
//     delimiter: string or undefined delimiter from previous element (eg: "#" or "." or "~")
//     name: string the name of the element (after unescaping, removing quoted etc)
// }
export function parseNamePath(t)
{
    let start = t.pos;
    let namepath = [];
    let delim = undefined;
    while (true)
    {
        // Prefix
        let prefix = t.read(/([a-zA-Z]+):/y);
        if (prefix)
            prefix = prefix[0];
        else
            prefix = undefined;

        // Escaped string part?
        let str = t.readString();
        if (str)
        {
            namepath.push({
                prefix,
                delim,
                name: str.value
            });
        }
        else
        {
            // Normal identifier?
            let id = t.readIdentifier();
            if (id)
            {
                namepath.push({
                    prefix,
                    delim,
                    name: id
                });
            }
            else
            {
                break;
            }
        }
        
        // Delimiter
        delim = t.read(/[#.~]/y);
        if (delim)
        {
            delim = delim[0];
            continue;
        }

        // End of name path?
        if (t.match(/[| \t\}]/y))
            return namepath;

        // Unknown, not a name path
        break;
    }

    t.pos = start;
    return null;
}


// Format an expanded name path array into a string
export function formatNamePath(np)
{
    let str = "";
    for (let n of np)
    {
        if (n.delimiter)
            str += n.delimiter;
        if (n.prefix)
            str += n.prefix;
        str += escapeNamePathElement(n.name);
    }
    return str;
}
