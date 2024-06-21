
const DEGRAD = 180 / Math.PI;
const RADDEG = Math.PI / 180;
const TOLERANCE_EQUAL = 0.00001;

const Error = {
    Ok: 0,
    ExpressionDivideByZero: 1,
    ExpressionInvalidArgument: 2,
    ExpressionUnknownOp: 3,
    ExpressionArgumentOutOfRange: 4,
    ExpressionSyntaxError: 5,
    GcodeUnsupportedCommand: 6,
    BadNumberFormat: 7
};

const NGCBinaryOp = {
    NoOp: 0,
    DividedBy: 1,
    Modulo: 2,
    Power: 3,
    Times: 4,
    Binary2: 4,
    And2: 5,
    ExclusiveOR: 6,
    Minus: 7,
    NotExclusiveOR: 8,
    Plus: 9,
    RightBracket: 10,
    RelationalFirst: 11,
    LT: 11,
    EQ: 12,
    NE: 13,
    LE: 14,
    GE: 15,
    GT: 16,
    RelationalLast: 16
};

const NGCUnaryOp = {
    ABS: 1,
    ACOS: 2,
    ASIN: 3,
    ATAN: 4,
    COS: 5,
    EXP: 6,
    FIX: 7,
    FUP: 8,
    LN: 9,
    Round: 10,
    SIN: 11,
    SQRT: 12,
    TAN: 13,
    Exists: 14
};

function execute_binary1(lhs, operation, rhs) {
    switch (operation) {
        case NGCBinaryOp.DividedBy:
            if (rhs === 0.0 || rhs === -0.0)
                return NaN
            return lhs / rhs

        case NGCBinaryOp.Modulo:
            lhs = lhs % rhs;
            if (lhs < 0.0)
                lhs += Math.abs(rhs);
            return lhs;

        case NGCBinaryOp.Power:
            if (lhs < 0.0 && Math.floor(rhs) !== rhs)
                return NaN
            return Math.pow(lhs, rhs);

        case NGCBinaryOp.Times:
            return lhs * rhs;

        default:
            return NaN
    }

    return NaN
}

function execute_binary2(lhs, operation, rhs) {
    switch (operation) {
        case NGCBinaryOp.And2:
            return ((lhs === 0.0) || (rhs === 0.0)) ? 0.0 : 1.0;

        case NGCBinaryOp.ExclusiveOR:
            return (((lhs === 0.0) && (rhs !== 0.0)) || ((lhs !== 0.0) && (rhs === 0.0))) ? 1.0 : 0.0;

        case NGCBinaryOp.Minus:
            return lhs - rhs;

        case NGCBinaryOp.NotExclusiveOR:
            return ((lhs !== 0.0) || (rhs !== 0.0)) ? 1.0 : 0.0;

        case NGCBinaryOp.Plus:
            return lhs + rhs;

        case NGCBinaryOp.LT:
            return (lhs < rhs) ? 1.0 : 0.0;

        case NGCBinaryOp.EQ:
            return (Math.abs(lhs - rhs) < TOLERANCE_EQUAL) ? 1.0 : 0.0;

        case NGCBinaryOp.NE:
            return (Math.abs(lhs - rhs) >= TOLERANCE_EQUAL) ? 1.0 : 0.0;

        case NGCBinaryOp.LE:
            return (lhs <= rhs) ? 1.0 : 0.0;

        case NGCBinaryOp.GE:
            return (lhs >= rhs) ? 1.0 : 0.0;

        case NGCBinaryOp.GT:
            return (lhs > rhs) ? 1.0 : 0.0;

        default:
            return NaN
    }

    return NaN;
}

function execute_binary(lhs, operation, rhs) {
    if (operation <= NGCBinaryOp.Binary2)
        return execute_binary1(lhs, operation, rhs);
    return execute_binary2(lhs, operation, rhs);
}

function execute_unary(operand, operation) {
    switch (operation) {
        case NGCUnaryOp.ABS:
        return (operand < 0.0) ? -operand : operand

        case NGCUnaryOp.ACOS:
            if (operand < -1.0 || operand > 1.0)
                return NaN
            return Math.acos(operand) * DEGRAD;

        case NGCUnaryOp.ASIN:
            if (operand < -1.0 || operand > 1.0)
                return NaN
            return Math.asin(operand) * DEGRAD;

        case NGCUnaryOp.COS:
            return Math.cos(operand * RADDEG);

        case NGCUnaryOp.EXP:
            return Math.exp(operand);

        case NGCUnaryOp.FIX:
            return Math.floor(operand);

        case NGCUnaryOp.FUP:
            return Math.ceil(operand);

        case NGCUnaryOp.LN:
            if (operand <= 0.0)
                return NaN
            return Math.log(operand);

        case NGCUnaryOp.Round:
            return Math.round(operand);

        case NGCUnaryOp.SIN:
            return Math.sin(operand * RADDEG);

        case NGCUnaryOp.SQRT:
            if (operand < 0.0)
                return NaN
            return Math.sqrt(operand);

        case NGCUnaryOp.TAN:
            return Math.tan(operand * RADDEG);

        case NGCUnaryOp.Exists:
            // Not implemented
            return 0.0

        default:
            operand = NaN
    }

    return operand;
}

function precedence(op) {
    switch (op) {
        case NGCBinaryOp.RightBracket:
            return 1;

        case NGCBinaryOp.And2:
        case NGCBinaryOp.ExclusiveOR:
        case NGCBinaryOp.NotExclusiveOR:
            return 2;

        case NGCBinaryOp.LT:
        case NGCBinaryOp.EQ:
        case NGCBinaryOp.NE:
        case NGCBinaryOp.LE:
        case NGCBinaryOp.GE:
        case NGCBinaryOp.GT:
            return 3;

        case NGCBinaryOp.Minus:
        case NGCBinaryOp.Plus:
            return 4;

        case NGCBinaryOp.NoOp:
        case NGCBinaryOp.DividedBy:
        case NGCBinaryOp.Modulo:
        case NGCBinaryOp.Times:
            return 5;

        case NGCBinaryOp.Power:
            return 6;

        default:
            break;
    }

    return 0;
}

function read_operation(s) {
    let c = s.line[s.pos];
    s.pos++;

    switch (c) {
        case '+':
            return NGCBinaryOp.Plus;

        case '-':
            return NGCBinaryOp.Minus;

        case '/':
            return NGCBinaryOp.DividedBy;

        case '*':
            if (s.line[s.pos] === '*') {
                s.pos++;
                return NGCBinaryOp.Power;
            }
            return NGCBinaryOp.Times;

        case ']':
            return NGCBinaryOp.RightBracket;

        case 'A':
            if (s.line.slice(s.pos, s.pos + 2) === "ND") {
                s.pos += 2;
                return NGCBinaryOp.And2;
            }
            return -1

        case 'M':
            if (s.line.slice(s.pos, s.pos + 2) === "OD") {
                s.pos += 2;
                return NGCBinaryOp.Modulo;
            }
            return -1

        case 'R':
            if (s.line[s.pos] === 'R') {
                s.pos++;
                return NGCBinaryOp.NotExclusiveOR;
            }
            return -1

        case 'X':
            if (s.line.slice(s.pos, s.pos + 2) === "OR") {
                s.pos += 2;
                return NGCBinaryOp.ExclusiveOR;
            }
            return -1

        case 'E':
            if (s.line[s.pos] === 'Q') {
                s.pos++;
                return NGCBinaryOp.EQ;
            }
            return -1

        case 'N':
            if (s.line[s.pos] === 'E') {
                s.pos++;
                return NGCBinaryOp.NE;
            }
            return -1

        case 'G':
            if (s.line[s.pos] === 'E') {
                s.pos++;
                return NGCBinaryOp.GE;
            }
            if (s.line[s.pos] === 'T') {
                s.pos++;
                return NGCBinaryOp.GT;
            }
            return -1

        case 'L':
            if (s.line[s.pos] === 'E') {
                s.pos++;
                return NGCBinaryOp.LE;
            }
            if (s.line[s.pos] === 'T') {
                s.pos++;
                return NGCBinaryOp.LT;
            }
            return -1

        default:
            return -1
    }

    return -1;
}

function read_operation_unary(s) {
    let c = s.line[s.pos];
    s.pos++;

    switch (c) {
        case 'A':
            if (s.line.slice(s.pos, s.pos + 2) === "BS") {
                s.pos += 2;
                return NGCUnaryOp.ABS;
            }
            if (s.line.slice(s.pos, s.pos + 3) === "COS") {
                s.pos += 3;
                return NGCUnaryOp.ACOS;
            }
            if (s.line.slice(s.pos, s.pos + 3) === "SIN") {
                s.pos += 3;
                return NGCUnaryOp.ASIN;
            }
            if (s.line.slice(s.pos, s.pos + 3) === "TAN") {
                s.pos += 3;
                return NGCUnaryOp.ATAN;
            }
            return -1

        case 'C':
            if (s.line.slice(s.pos, s.pos + 2) === "OS") {
                s.pos += 2;
                return NGCUnaryOp.COS;
            }
            return -1

        case 'E':
            if (s.line.slice(s.pos, s.pos + 2) === "XP") {
                s.pos += 2;
                return NGCUnaryOp.EXP;
            }
            if (s.line.slice(s.pos, s.pos + 5) === "XISTS") {
                s.pos += 5;
                return NGCUnaryOp.Exists;
            }
            return -1

        case 'F':
            if (s.line.slice(s.pos, s.pos + 2) === "IX") {
                s.pos += 2;
                return NGCUnaryOp.FIX;
            }
            if (s.line.slice(s.pos, s.pos + 2) === "UP") {
                s.pos += 2;
                return NGCUnaryOp.FUP;
            }
            return -1

        case 'L':
            if (s.line[s.pos] === 'N') {
                s.pos++;
                return NGCUnaryOp.LN;
            }
            return -1

        case 'R':
            if (s.line.slice(s.pos, s.pos + 4) === "OUND") {
                s.pos += 4;
                return NGCUnaryOp.Round;
            }
            return -1
            break;

        case 'S':
            if (s.line.slice(s.pos, s.pos + 2) === "IN") {
                s.pos += 2;
                return NGCUnaryOp.SIN;
            }
            if (s.line.slice(s.pos, s.pos + 3) === "QRT") {
                s.pos += 3;
                return NGCUnaryOp.SQRT;
            }
            return -1

        case 'T':
            if (s.line.slice(s.pos, s.pos + 2) === "AN") {
                s.pos += 2;
                return NGCUnaryOp.TAN;
            }
            return -1

        return -1
    }

    return -1
}

function read_atan(s) {
    if (s.line[s.pos] !== '/')
        return Error.ExpressionSyntaxError;

    s.pos++;

    if (s.line[s.pos] !== '[')
        return Error.ExpressionSyntaxError;

    s.pos++;
    let argument2 = expression(s);
    if (isNaN(argument2))
        return NaN;

    return Math.atan2(value[0], argument2) * DEGRAD; // value in radians, convert to degrees
}

function read_unary(s) {
    let operation

    operation = read_operation_unary(s);
    if (operation == -1)
        return NaN

    if (s.line[s.pos] !== '[')
        return NaN

    s.pos++;
    if (operation[0] === NGCUnaryOp.Exists) {
        let arg = '';
        let c;
        while ((c = s.line[s.pos]) && c !== ']') {
            s.pos++;
            arg += c;
        }
        if (!c) {
            return NaN
        }
        s.pos++;
        return named_param_exists(arg) ? 1.0 : 0.0;
    }
    let value = expression(s);
    if (isNan(value))
        return NaN;

    if (operation[0] === NGCUnaryOp.ATAN) {
        return read_atan(s);
    }
    return execute_unary(value, operation[0]);
}

function expression(s) {
    const values = [];
    const operators = [];
    let stack_index = 1;

    if (s.line[s.pos] !== '[') {
        return NaN
    }

    s.pos++;

    values[0] = read_number(s, true)
    if (isNaN(values[0])) {
        return NaN;
    }

    operators[0] = read_operation(s);
    if (operators[0] === -1)
        return NaN;

    for (; operators[0] !== NGCBinaryOp.RightBracket;) {
        values[stack_index] = read_number(s, true);
        if (isNaN(values[stack_index]))
            return NaN

        operators[stack_index] = read_operation(s);
        if (operators[stack_index] === -1)
            return NaN;

        if (precedence(operators[stack_index]) > precedence(operators[stack_index - 1]))
            stack_index++;
        else {
            for (; precedence(operators[stack_index]) <= precedence(operators[stack_index - 1]);) {
                values[stack_index - 1] = execute_binary(values[stack_index - 1], operators[stack_index - 1], values[stack_index]);
                if (isNaN(values[stack_index - 1]))
                    return NaN;

                operators[stack_index - 1] = operators[stack_index];
                if ((stack_index > 1) && precedence(operators[stack_index - 1]) <= precedence(operators[stack_index - 2]))
                    stack_index--;
                else
                    break;
            }
        }
    }

    return values[0];
}
