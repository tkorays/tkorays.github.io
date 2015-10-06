

if [ ! $1 ]; then
    echo no title specified!
    exit
fi

dt=`date "+%Y-%m-%d"`

filename="${dt}-$1.markdown"
touch "_posts/$filename"

more template.txt > "_posts/$filename"
